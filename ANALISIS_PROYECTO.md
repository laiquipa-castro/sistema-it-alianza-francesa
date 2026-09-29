# Revisión del Sistema IT Alianza — 29/09/2026

## Estado de implementación

La Fase 1 quedó implementada: autenticación mediante ID token de Google validado en el backend, vínculo persistente con el identificador `sub`, protección permanente de los cuatro administradores institucionales y propagación de errores reales en la gestión de usuarios.

La Fase 2 también quedó implementada: historial inmutable de notas con autor y fecha, nota de solución obligatoria para solucionar/cerrar, fechas de tickets con zona horaria de Lima y asignación coherente mediante el ID de técnicos activos.

## Alcance y estado

Revisión del código fuente de frontend y backend, modelos, validaciones, scripts auxiliares, configuración de compilación, Docker, PWA y notificaciones. Se ejecutaron comprobaciones estáticas y solicitudes HTTP contra una base SQLite exclusivamente en memoria, con las funciones de notificación sustituidas por funciones sin efectos externos.

No se modificó el código funcional ni las bases existentes. Se preservó el cambio previo en `frontend/app/page.tsx` que incorpora `useRouter` y `router.refresh()` al editar usuarios. No se inspeccionaron secretos, registros personales de las bases ni el contenido del respaldo ZIP.

No se verificaron el despliegue real, la interfaz en navegador, OAuth real, entrega SMTP/WhatsApp, DeepSeek, migraciones sobre PostgreSQL ni compilación de producción. Los hallazgos estáticos no equivalen a una reproducción en producción.

## Mapa del proyecto

| Área | Implementación |
| --- | --- |
| Interfaz | Next.js 16.3.6, React 19.2.8, TypeScript, Tailwind 4 |
| Pantalla principal | `frontend/app/page.tsx`: aproximadamente 2.400 líneas con autenticación, formularios, dashboard, filtros, usuarios, sedes, reportes y chat |
| Enlaces a tickets | `frontend/app/admin/tickets/[id]/page.tsx` redirige a `/?ticket=id` |
| API | FastAPI; endpoints y reglas de negocio en `backend/main.py` |
| Persistencia | SQLAlchemy; entidades Sede, Usuario, Ticket y SolucionFrecuente |
| Validación | Pydantic en `backend/schemas.py` |
| Asistente | Coincidencias de palabras clave locales; consulta opcional a DeepSeek si no hay coincidencias |
| Avisos | SMTP y gateway WhatsApp mediante BackgroundTasks |
| Instalación web | Manifest, iconos y service worker; API excluida de caché |
| Despliegue | Dockerfile para backend; configuración de frontend y URLs por entorno |

La separación de modelos, esquemas y servicios en backend facilita mejoras. Los correos y reportes HTML escapan los principales datos introducidos por usuarios. Ya existen filtros, enlaces directos, permisos por rol y tratamiento de fallos de los proveedores de notificaciones, aunque hay problemas en la autenticación que invalidan la protección efectiva de esos permisos.

## Prioridades confirmadas

### 1. Crítica: el backend no acredita la identidad

`backend/main.py:313` acepta `X-User-Email` como identidad. `backend/main.py:351` recibe email y nombre, sin token de Google. El frontend consulta Google, pero no transmite una credencial que el servidor valide.

Prueba aislada: `/api/auth/verify` devolvió HTTP 200 y `ADMIN_TI` enviando únicamente un correo de la lista administrativa. `/api/usuarios` respondió 200 usando ese correo en el encabezado. Esto permite suplantación sin demostrar acceso a la cuenta de Google.

Corrección: validar identidad en servidor, emitir/verificar una sesión y derivar el usuario de esa sesión en cada endpoint protegido. El correo del cliente no debe funcionar como credencial.

### 2. Alta: creación pública de tickets y asistente público

`backend/main.py:538` no requiere usuario autenticado. También acepta del cliente estado, técnico y notas. Prueba aislada: se creó un ticket anónimo con estado `ESTADO_INVALIDO`, sin descripción, y la API respondió 200.

`backend/main.py:669` permite consultas al asistente sin autenticación ni límites implementados en la aplicación. Si DeepSeek está habilitado, esa ruta puede generar consumo externo.

Corrección: proteger ambas rutas, tomar el solicitante de la sesión, limitar entradas y establecer en servidor los campos iniciales del ticket.

### 3. Alta: el inicio de sesión sobrescribe los roles administrados

`backend/main.py:380` fuerza `ADMIN_TI` para cuatro correos y `Usuario` para los demás. El frontend repite la regla en `frontend/app/page.tsx:605`.

Prueba aislada: se creó un usuario `HELPDESK_TI`; al verificar su acceso pasó a `Usuario`. Por tanto, las modificaciones del panel no constituyen una política de roles persistente. Los cuatro correos listados recuperan privilegios administrativos al ingresar.

Corrección: definir la política esperada y mantener una única fuente de roles en servidor, con aprovisionamiento inicial separado del login.

### 4. Alta: errores HTTP tratados como éxito

`frontend/app/page.tsx:470`: `fetchTickets` asigna cualquier JSON a `tickets`; una respuesta 401/403 con `{detail: ...}` puede romper las llamadas posteriores a `find`/`filter`.

`frontend/app/page.tsx:633`: al crear un ticket se borra la descripción y se muestra éxito sin comprobar `res.ok`. El guardado de notas y varias operaciones de soluciones también limpian formularios sin confirmar persistencia.

Corrección: cliente API común, comprobación de estado y forma de respuesta, errores visibles, conservación del texto cuando falla una operación y prevención de envíos repetidos.

### 5. Alta: estado de la sesión anterior permanece en memoria

`frontend/app/page.tsx:625` solo ejecuta `setUser(null)` al salir. Conserva tickets, detalle abierto, usuarios, chat y pestaña activa. Al iniciar sesión con otra cuenta, esos datos pueden seguir presentes mientras se cargan los nuevos. El efecto del enlace directo no limpia el detalle si el nuevo usuario no tiene ese ticket.

Corrección: limpiar todo el estado asociado a la sesión y descartar respuestas pendientes de la sesión anterior. Verificar el cambio administrador → usuario en el mismo navegador.

## Integridad y funcionamiento

- **Historial reconstruido:** `construirTimeline` y el PDF inventan la fecha de asignación/notas reutilizando creación o resolución. Las notas se sobrescriben en un único campo. Incorporar eventos persistentes con autor, fecha y acción antes de presentar esto como historial auditable.
- **Asignación inconsistente:** cambiar estado envía el nombre de quien opera como `tecnico_asignado`, pero conserva el ID del técnico anterior. Pantalla y WhatsApp pueden apuntar a personas distintas. La opción «Sin asignar» no funciona porque el handler retorna si el valor está vacío; la API tampoco trata null como desasignación.
- **Técnicos:** la lista incluye suspendidos; al asignar no se comprueba rol ni estado. Un ID inexistente puede producir un error de integridad sin respuesta controlada.
- **Fechas:** `datetime.now()` y DateTime sin zona horaria dejan la interpretación al servidor/navegador. Repetir «Solucionado» cambia la fecha; reabrir conserva la anterior; cerrar directamente no fija fecha. Esto altera métricas e historial.
- **Correlativos:** `_generar_codigo` consulta y luego inserta sin reserva atómica ni reintento por colisión. Dos solicitudes concurrentes pueden elegir el mismo código y una fallar. Hallazgo estático, no prueba de carga.
- **Validaciones:** UsuarioUpdate no valida rol/estado como UsuarioIn; varias entradas admiten valores vacíos, arbitrarios o referencias inexistentes. `validar_dominio` comprueba un sufijo, no la sintaxis completa del correo.
- **WhatsApp del usuario:** UsuarioIn admite `telefono_whatsapp`, pero create_usuario no lo copia; UsuarioUpdate no permite editarlo.
- **Sedes y semillas:** al reiniciar se reinsertan sedes iniciales eliminadas; las soluciones iniciales eliminadas o renombradas también pueden reaparecer por la búsqueda por título. Acordar si deben ser datos de instalación o catálogos obligatorios.
- **Gestión de usuarios:** permite crear rol Usuario, pero el listado devuelve solo roles TI; el registro desaparece del panel después de refrescar.
- **Reportes:** los pendientes se etiquetan «EN PROCESO» en el PDF. El CSV escapa comillas pero no neutraliza valores interpretables como fórmulas por hojas de cálculo.
- **SLA:** es un cálculo visual por prioridad; no existe persistencia ni calendario laboral. Presentarlo como estimación hasta definir reglas operativas.
- **Base de conocimiento:** normaliza consulta a minúsculas, pero no las palabras clave guardadas. No maneja equivalencias de tildes. La función denominada entrenamiento agrega soluciones locales; no entrena el modelo externo.

## Persistencia, despliegue y mantenimiento

- `backend/config.py:39` agrega `*` a CORS incondicionalmente, aunque se configure una lista restringida. Respetar los orígenes configurados; CORS no sustituye autenticación.
- `backend/database.py:34` usa SQLite con ruta relativa al directorio de ejecución. Hay dos bases versionadas: `sistema_it.db` y `backend/sistema_it.db`. Arrancar desde distintas carpetas puede seleccionar datos diferentes.
- Las migraciones manuales incorporan `DATETIME`, no portable a PostgreSQL, y columnas sin reconstruir todas las restricciones del modelo. Introducir migraciones versionadas y probar una copia antes de aplicarlas a datos reales.
- `insert_users.py` y `check_db.py` operan sobre la tabla legacy `users`; la aplicación utiliza `usuarios`. El primero mezcla rutas de conexión relativas y absolutas.
- Git incluye dos bases y un ZIP. No se inspeccionó su contenido. Separar respaldos del código y definir restauración y acceso a datos.
- El Dockerfile usa `COPY . .` sin `.dockerignore` en backend. El contexto podría incluir archivos locales no destinados a la imagen, incluidos entornos y bases.
- Las notificaciones se ejecutan dentro del proceso y no tienen cola duradera, reintentos persistentes ni seguimiento de entrega.
- Los listados no tienen paginación; el frontend recibe todos los tickets y filtra en memoria.
- El ID público de cliente Google está fijo en código. Parametrizarlo por entorno; el ID de cliente no es una contraseña.
- El frontend concentra reglas, red, HTML de reportes y vistas en un archivo grande. Separar por módulos después de asegurar los flujos.
- El service worker guarda cualquier respuesta de navegación como `/`, sin comprobar éxito. Revisar fallback, respuestas de error y ciclo de actualización antes de afirmar soporte offline completo.
- Las tablas de seis columnas con `overflow-hidden` requieren verificación móvil. Los modales necesitan revisión de foco, semántica de diálogo y etiquetas accesibles. Observaciones de código, pendientes de evaluación visual.
- No se encontraron pruebas automatizadas del proyecto ni configuración CI versionada. El README sigue siendo la plantilla de Next.js.

## Verificación realizada

| Comprobación | Resultado |
| --- | --- |
| TypeScript: `npx.cmd --no-install tsc --noEmit --incremental false` | Correcto, salida 0 |
| ESLint: `npm.cmd run lint` | 17 errores y 10 advertencias; salida 1 |
| Sintaxis de 11 archivos Python mediante AST | Correcta |
| API FastAPI con SQLite en memoria | Confirmadas suplantación por email, creación anónima/estado arbitrario y pérdida de rol tras login |
| Git | Cambio previo del usuario preservado; solo se añade este informe |

Los errores de lint incluyen tipos `any`, reglas de React y uso de `require` en el generador de iconos; las advertencias incluyen variables sin usar, dependencias de efectos e imágenes. TypeScript correcto no implica que los flujos de negocio estén correctos.

## Orden propuesto para continuar

1. Autenticación verificable, sesión, protección de rutas y política única de roles.
2. Manejo de fallos HTTP y limpieza de estado al cambiar de cuenta.
3. Validaciones, asignación de técnicos, estados, fechas y correlativos.
4. Historial persistente y coherencia de reportes/SLA.
5. Migraciones, ruta de base, respaldos y empaquetado de despliegue.
6. Componentes y tipos compartidos; resolver lint; pruebas de regresión de permisos y tickets.
7. Revisión visual en escritorio/móvil, accesibilidad y PWA con los flujos ya estabilizados.
