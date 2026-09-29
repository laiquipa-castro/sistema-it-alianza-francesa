"""API principal del Sistema IT Alianza (FastAPI + SQLAlchemy ORM).

La capa de datos está desacoplada en :mod:`database`, :mod:`models` y
:mod:`schemas`, por lo que este módulo solo orquesta la lógica HTTP y de
negocio de forma agnóstica al motor de base de datos.
"""
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import List, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

import models  # noqa: F401  # registra los modelos en Base.metadata
from database import Base, SessionLocal, engine, get_db, init_db
from models import LIMA_TZ, Sede, SolucionFrecuente, Ticket, TicketNote, Usuario, lima_now
from schemas import (
    AsistenteIn,
    ESTADOS_TICKET,
    SedeIn,
    SedeOut,
    SolucionIn,
    SolucionOut,
    SolucionUpdate,
    TicketIn,
    TicketOut,
    TicketUpdate,
    UsuarioIn,
    UsuarioOut,
    UsuarioUpdate,
)
from config import CORS_ORIGINS
from auth_service import verified_google_identity
from email_service import send_new_ticket_email, send_ticket_resolved_email
from whatsapp_service import send_new_ticket_whatsapp
from ai_service import buscar_soluciones, consultar_deepseek
from seed_soluciones import seed_soluciones

# ---------------------------------------------------------------------------
# Aplicación y CORS
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    _migrate()
    init_db()
    db = SessionLocal()
    try:
        seed_data(db)
        migrar_notas_legacy(db)
        normalizar_correos_ti(db)
        asegurar_administradores_ti(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Sistema IT Alianza", lifespan=lifespan)

# CORS - restringido al frontend corporativo
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Constantes de dominio
# ---------------------------------------------------------------------------
DOMINIO_PERMITIDO = "@alianzafrancesa.org.pe"
TI_ROLES = ["ADMIN_TI", "HELPDESK_TI", "ARQUITECTO_TI", "INFRAESTRUCTURA_TI"]

# Correos institucionales autorizados para el rol protegido ADMIN_TI.
# El resto de las cuentas conserva el rol administrado en la base de datos.
TI_ADMIN_EMAILS = {
    "l.aiquipa-castro@alianzafrancesa.org.pe",
    "a.alcantara@alianzafrancesa.org.pe",
    "j.salas@alianzafrancesa.org.pe",
    "j.barbaran@alianzafrancesa.org.pe",
}

# Correos "largos" (legacy) -> correo oficial corto de cada técnico de TI.
# Se usa en :func:`normalizar_correos_ti` para actualizar, de forma idempotente,
# los registros existentes que aún conservan un correo legado al correo corto
# oficial listado en el enunciado de corrección de TI.
CORREOS_TI_LEGACY = {
    "luis.aiquipa@alianzafrancesa.org.pe": "l.aiquipa-castro@alianzafrancesa.org.pe",
    "adrian.alcantara@alianzafrancesa.org.pe": "a.alcantara@alianzafrancesa.org.pe",
    "jhon.salas@alianzafrancesa.org.pe": "j.salas@alianzafrancesa.org.pe",
    "jesus.barbaran@alianzafrancesa.org.pe": "j.barbaran@alianzafrancesa.org.pe",
}

SEDES_INICIALES = [
    ("Miraflores", "Sede Principal"),
    ("Los Olivos", "Sede Descentralizada"),
    ("La Molina", "Sede Descentralizada"),
    ("Jesús María", "Sede Descentralizada"),
    ("Remoto", "Modalidad Remota"),
]

USUARIOS_INICIALES = [
    {
        "email": "l.aiquipa-castro@alianzafrancesa.org.pe",
        "nombre": "LUIS ALBERTO AIQUIPA-CASTRO ROBERTS",
        "rol": "ADMIN_TI",
        "estado": "Activo",
        "tipo_colaborador": "Administrativo",
        "sede": "Miraflores",
        "cargo_ti": "Responsable de Sistemas - Administrador Maestro TI",
        "telefono_whatsapp": "+51986068159",
    },
    {
        "email": "j.barbaran@alianzafrancesa.org.pe",
        "nombre": "JESÚS ALBERTO BARBARÁN ROJAS",
        "rol": "HELPDESK_TI",
        "estado": "Activo",
        "tipo_colaborador": "Administrativo",
        "sede": "Miraflores",
        "cargo_ti": "Help Desk TI",
    },
    {
        "email": "j.salas@alianzafrancesa.org.pe",
        "nombre": "JHON SALAS TAYPE",
        "rol": "ARQUITECTO_TI",
        "estado": "Activo",
        "tipo_colaborador": "Administrativo",
        "sede": "Miraflores",
        "cargo_ti": "Arquitecto de Soluciones TI",
    },
    {
        "email": "a.alcantara@alianzafrancesa.org.pe",
        "nombre": "ADRIÁN ANGELO ALCÁNTARA ALVÁN",
        "rol": "INFRAESTRUCTURA_TI",
        "estado": "Activo",
        "tipo_colaborador": "Administrativo",
        "sede": "Miraflores",
        "cargo_ti": "Gestor de Infraestructura TI",
    },
]


# ---------------------------------------------------------------------------
# Helpers de serialización
# ---------------------------------------------------------------------------
def _usuario_to_dict(u: Usuario) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "nombre": u.nombre,
        "rol": u.rol,
        "estado": u.estado,
        "tipo_colaborador": u.tipo_colaborador,
        "sede_id": u.sede_id,
        "sede_nombre": u.sede.nombre if u.sede else None,
        "cargo_ti": u.cargo_ti,
        "telefono_whatsapp": u.telefono_whatsapp,
    }


def _ticket_to_dict(t: Ticket) -> dict:
    def fecha_lima(value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=LIMA_TZ)
        return value.astimezone(LIMA_TZ)

    return {
        "id": t.id,
        "solicitante_email": t.solicitante_email,
        "user_name": t.user_name,
        "tipo_requerimiento": t.tipo_requerimiento,
        "prioridad": t.prioridad,
        "descripcion": t.descripcion,
        "estado": t.estado,
        "tecnico_asignado": t.tecnico_asignado,
        "tecnico_asignado_id": t.tecnico_asignado_id,
        "sede": t.sede,
        "tipo_colaborador": t.tipo_colaborador,
        "notas_tecnicas": t.notas_tecnicas,
        "fecha_creacion": fecha_lima(t.fecha_creacion),
        "fecha_actualizacion": fecha_lima(t.fecha_actualizacion),
        "sede_id": t.sede_id,
        "codigo": t.codigo,
        "fecha_resolucion": fecha_lima(t.fecha_resolucion),
        "notas": [
            {
                "id": nota.id,
                "autor_id": nota.autor_id,
                "autor_email": nota.autor_email,
                "autor_nombre": nota.autor_nombre,
                "contenido": nota.contenido,
                "tipo": nota.tipo,
                "estado_resultante": nota.estado_resultante,
                "fecha_creacion": fecha_lima(nota.fecha_creacion),
            }
            for nota in t.notas
        ],
    }


def _generar_codigo(db: Session) -> str:
    """Genera un código correlativo único por año (ej. AF-2026-0001)."""
    anio = date.today().year
    prefix = f"AF-{anio}-"
    ultimo = (
        db.query(Ticket.codigo)
        .filter(Ticket.codigo.like(f"{prefix}%"))
        .order_by(Ticket.id.desc())
        .first()
    )
    seq = 1
    if ultimo and ultimo[0]:
        try:
            seq = int(ultimo[0].rsplit("-", 1)[-1]) + 1
        except ValueError:
            seq = 1
    while True:
        codigo = f"{prefix}{seq:04d}"
        if not db.query(Ticket).filter(Ticket.codigo == codigo).first():
            return codigo
        seq += 1


# ---------------------------------------------------------------------------
# Inicialización y migración ligera de esquema
# ---------------------------------------------------------------------------
def _migrate() -> None:
    """Migraciones ligeras para bases de datos SQLite preexistentes.

    La tabla ``tickets`` heredada no contaba con la columna ``sede_id``
    (clave foránea hacia ``sedes``). Aquí se agrega si falta. En despliegues
    de producción se recomienda usar Alembic para un control más estricto.
    """
    insp = inspect(engine)
    tablas = insp.get_table_names()

    if "tickets" in tablas:
        cols = {c["name"] for c in insp.get_columns("tickets")}
        if "sede_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN sede_id INTEGER"))
        if "codigo" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN codigo VARCHAR(30)"))
        if "fecha_resolucion" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN fecha_resolucion DATETIME"))
        if "fecha_actualizacion" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN fecha_actualizacion TIMESTAMP"))
                conn.execute(
                    text(
                        "UPDATE tickets SET fecha_actualizacion = fecha_creacion "
                        "WHERE fecha_actualizacion IS NULL"
                    )
                )
        if "tecnico_asignado_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN tecnico_asignado_id INTEGER"))
        if "user_name" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN user_name VARCHAR(255)"))

    if "usuarios" in tablas:
        cols = {c["name"] for c in insp.get_columns("usuarios")}
        if "google_sub" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE usuarios ADD COLUMN google_sub VARCHAR(255)"))
        if "telefono_whatsapp" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE usuarios ADD COLUMN telefono_whatsapp VARCHAR(30)"))


def seed_data(db: Session) -> None:
    """Inserta las sedes y usuarios iniciales de forma idempotente y NO destructiva.

    - Sedes: se insertan solo si no existen (búsqueda por nombre).
    - Usuarios: se insertan únicamente en el primer arranque (tabla vacía),
      para no sobrescribir ni duplicar a los usuarios que el administrador
      haya editado posteriormente (por ejemplo, cambios de correo).

    De esta forma, las ediciones del administrador persisten entre reinicios.
    """
    for nombre, tipo in SEDES_INICIALES:
        if not db.query(Sede).filter(Sede.nombre == nombre).first():
            db.add(Sede(nombre=nombre, tipo=tipo))
    db.flush()

    # Solo sembrar usuarios cuando la tabla está vacía (primera ejecución).
    if db.query(Usuario).count() == 0:
        sede_ids = {s.nombre: s.id for s in db.query(Sede).all()}
        for u in USUARIOS_INICIALES:
            db.add(
                Usuario(
                    email=u["email"],
                    nombre=u["nombre"],
                    rol=u["rol"],
                    estado=u["estado"],
                    tipo_colaborador=u["tipo_colaborador"],
                    sede_id=sede_ids.get(u["sede"]),
                    cargo_ti=u["cargo_ti"],
                    telefono_whatsapp=u.get("telefono_whatsapp"),
                )
            )
    db.commit()

    seed_soluciones(db)


def migrar_notas_legacy(db: Session) -> None:
    """Conserva una única vez las notas antiguas dentro del historial nuevo."""
    tickets = (
        db.query(Ticket)
        .filter(Ticket.notas_tecnicas.isnot(None), Ticket.notas_tecnicas != "")
        .all()
    )
    for ticket in tickets:
        contenido_legacy = ticket.notas_tecnicas.strip()
        if not contenido_legacy:
            continue
        if db.query(TicketNote.id).filter(TicketNote.ticket_id == ticket.id).first():
            continue
        db.add(
            TicketNote(
                ticket_id=ticket.id,
                autor_email="sistema@alianzafrancesa.org.pe",
                autor_nombre="Migración del sistema",
                contenido=contenido_legacy,
                tipo="legacy",
                estado_resultante=ticket.estado,
                fecha_creacion=ticket.fecha_resolucion or ticket.fecha_creacion or lima_now(),
            )
        )
    db.commit()


def normalizar_correos_ti(db: Session) -> None:
    """Actualiza los correos legacy de los técnicos TI a su correo corto oficial.

    Los registros existentes que aún conservan un correo largo (legacy) se
    normalizan de forma idempotente a su correo corto oficial, de modo que la
    autenticación OAuth, las notificaciones y la Gestión de Usuarios operen
    siempre con el correo institucional oficial. No toca usuarios no mapeados.
    """
    usuarios = db.query(Usuario).filter(Usuario.rol.in_(TI_ROLES)).all()
    for u in usuarios:
        correo_actual = (u.email or "").strip().lower()
        correo_oficial = CORREOS_TI_LEGACY.get(correo_actual)
        if not correo_oficial:
            continue
        # Evita colisiones: si el correo oficial ya pertenece a otro registro,
        # se conserva ese registro oficial y se descarta la reasignación.
        destino = (
            db.query(Usuario)
            .filter(Usuario.email == correo_oficial, Usuario.id != u.id)
            .first()
        )
        if destino is None:
            u.email = correo_oficial
    db.commit()


# ---------------------------------------------------------------------------
# Autorización basada en roles (RBAC)
# ---------------------------------------------------------------------------
def asegurar_administradores_ti(db: Session) -> None:
    """Conserva activos los administradores institucionales y su rol protegido."""
    for email in TI_ADMIN_EMAILS:
        u = db.query(Usuario).filter(Usuario.email == email).first()
        if u is None:
            initial = next(item for item in USUARIOS_INICIALES if item["email"] == email)
            u = Usuario(email=email, nombre=initial["nombre"], rol="ADMIN_TI", estado="Activo", cargo_ti=initial.get("cargo_ti"))
            db.add(u)
        else:
            u.rol = "ADMIN_TI"
            u.estado = "Activo"
    db.commit()


def _get_current_user(
    identity: dict = Depends(verified_google_identity),
    db: Session = Depends(get_db),
) -> dict:
    """Obtiene permisos actuales desde la BD para una identidad acreditada."""
    u = (
        db.query(Usuario)
        .options(joinedload(Usuario.sede))
        .filter(Usuario.google_sub == identity["sub"], Usuario.email == identity["email"])
        .first()
    )
    if u is None:
        raise HTTPException(status_code=401, detail="Usuario no registrado")
    if u.estado != "Activo":
        raise HTTPException(status_code=403, detail="Usuario suspendido. Contacte a Sistemas.")
    return _usuario_to_dict(u)


def require_admin(user: dict = Depends(_get_current_user)) -> dict:
    """Restringe el acceso al rol Administrador TI (control total)."""
    if user["rol"] != "ADMIN_TI":
        raise HTTPException(status_code=403, detail="Requiere permisos de Administrador TI")
    return user


def require_ti(user: dict = Depends(_get_current_user)) -> dict:
    """Restringe el acceso al equipo de Soporte TI y administrador."""
    if user["rol"] not in TI_ROLES:
        raise HTTPException(status_code=403, detail="Requiere permisos del equipo de Soporte TI")
    return user


# ---------------------------------------------------------------------------
# Endpoints: Autenticación / Verificación
# ---------------------------------------------------------------------------
@app.post("/api/auth/verify", response_model=UsuarioOut)
def verify_user(identity: dict = Depends(verified_google_identity), db: Session = Depends(get_db)):
    """Vincula una cuenta únicamente después de verificar su token Google."""
    email = identity["email"]
    linked = db.query(Usuario).filter(Usuario.google_sub == identity["sub"]).first()
    if linked is not None and linked.email != email:
        raise HTTPException(409, "El correo registrado no coincide con Google. Contacte a Sistemas.")
    u = (
        db.query(Usuario)
        .options(joinedload(Usuario.sede))
        .filter(Usuario.email == email)
        .first()
    )

    if u is None:
        u = Usuario(email=email, nombre=identity["nombre"], rol="Usuario", estado="Activo")
        db.add(u)

    if u.google_sub is not None and u.google_sub != identity["sub"]:
        raise HTTPException(403, "El correo está vinculado a otra identidad Google")

    if u.estado != "Activo":
        raise HTTPException(status_code=403, detail="Usuario suspendido. Contacte a Sistemas.")

    u.google_sub = identity["sub"]
    if email in TI_ADMIN_EMAILS:
        u.rol = "ADMIN_TI"
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "La cuenta cambió durante el acceso. Intente nuevamente.") from None
    db.refresh(u)

    return _usuario_to_dict(u)


# ---------------------------------------------------------------------------
# Endpoints: Sedes
# ---------------------------------------------------------------------------
@app.get("/api/sedes", response_model=List[SedeOut])
def list_sedes(db: Session = Depends(get_db)):
    return db.query(Sede).order_by(Sede.id).all()


@app.post("/api/sedes", response_model=SedeOut)
def create_sede(sede: SedeIn, db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    if db.query(Sede).filter(Sede.nombre == sede.nombre).first():
        raise HTTPException(status_code=409, detail="La sede ya existe")
    s = Sede(nombre=sede.nombre, tipo=sede.tipo)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@app.put("/api/sedes/{sede_id}", response_model=SedeOut)
def update_sede(sede_id: int, sede: SedeIn, db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    s = db.get(Sede, sede_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    s.nombre = sede.nombre
    s.tipo = sede.tipo
    db.commit()
    db.refresh(s)
    return s


@app.delete("/api/sedes/{sede_id}", response_model=dict)
def delete_sede(sede_id: int, db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    s = db.get(Sede, sede_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Sede no encontrada")
    db.delete(s)
    db.commit()
    return {"ok": True, "detail": "Sede eliminada"}


# ---------------------------------------------------------------------------
# Endpoints: Usuarios
# ---------------------------------------------------------------------------
@app.get("/api/usuarios", response_model=List[UsuarioOut])
def list_usuarios(db: Session = Depends(get_db), user: dict = Depends(require_ti)):
    """Lista únicamente al personal técnico (roles TI).

    Cualquier miembro del equipo TI puede consultar el listado (solo lectura);
    la creación/edición/eliminación sigue restringida a ADMIN_TI mediante
    ``require_admin`` en los endpoints de mutación.
    """
    rows = (
        db.query(Usuario)
        .options(joinedload(Usuario.sede))
        .filter(Usuario.rol.in_(TI_ROLES))
        .order_by(Usuario.id)
        .all()
    )
    return [_usuario_to_dict(u) for u in rows]


@app.get("/api/usuarios/{email}", response_model=UsuarioOut)
def get_usuario(email: str, db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    u = (
        db.query(Usuario)
        .options(joinedload(Usuario.sede))
        .filter(Usuario.email == email.strip().lower())
        .first()
    )
    if u is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return _usuario_to_dict(u)


@app.post("/api/usuarios", response_model=UsuarioOut)
def create_usuario(usuario: UsuarioIn, db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    if db.query(Usuario).filter(Usuario.email == usuario.email).first():
        raise HTTPException(status_code=409, detail="El usuario ya existe")
    if usuario.rol == "ADMIN_TI" and usuario.email not in TI_ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="El rol ADMIN_TI está reservado a los correos autorizados")

    u = Usuario(
        email=usuario.email,
        nombre=usuario.nombre,
        rol="ADMIN_TI" if usuario.email in TI_ADMIN_EMAILS else usuario.rol,
        estado=usuario.estado,
        tipo_colaborador=usuario.tipo_colaborador,
        sede_id=usuario.sede_id,
        cargo_ti=usuario.cargo_ti,
        telefono_whatsapp=usuario.telefono_whatsapp,
    )
    db.add(u)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Datos inválidos (sede o campos)")
    db.refresh(u)
    return _usuario_to_dict(u)


@app.put("/api/usuarios/{usuario_id}", response_model=UsuarioOut)
def update_usuario(usuario_id: int, update: UsuarioUpdate, db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    u = db.get(Usuario, usuario_id)
    if u is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if not update.model_fields_set:
        raise HTTPException(400, "No hay campos para actualizar")
    if u.email in TI_ADMIN_EMAILS:
        if update.email is not None and update.email != u.email:
            raise HTTPException(409, "El correo de un administrador institucional está protegido")
        if update.rol is not None and update.rol != "ADMIN_TI":
            raise HTTPException(409, "Los administradores institucionales deben conservar el rol ADMIN_TI")
        if update.estado is not None and update.estado != "Activo":
            raise HTTPException(409, "Los administradores institucionales deben permanecer activos")
    elif update.email in TI_ADMIN_EMAILS:
        raise HTTPException(409, "No se puede reasignar un correo reservado de TI")
    elif update.rol == "ADMIN_TI":
        raise HTTPException(403, "El rol ADMIN_TI está reservado a los correos autorizados")
    if update.sede_id is not None and db.get(Sede, update.sede_id) is None:
        raise HTTPException(400, "La sede indicada no existe")

    if update.email is not None and update.email != u.email:
        if db.query(Usuario).filter(Usuario.email == update.email, Usuario.id != usuario_id).first():
            raise HTTPException(status_code=409, detail="El correo ya está registrado en otro usuario")
        u.email = update.email

    for campo in ["nombre", "rol", "estado", "tipo_colaborador", "cargo_ti"]:
        valor = getattr(update, campo)
        if valor is not None:
            setattr(u, campo, valor)

    # ``sede_id`` admite ser vaciado explícitamente (None) usando model_fields_set.
    if "sede_id" in update.model_fields_set:
        u.sede_id = update.sede_id

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "La actualización entra en conflicto con los datos existentes") from None
    db.refresh(u)
    return _usuario_to_dict(u)


@app.delete("/api/usuarios/{usuario_id}", response_model=dict)
def delete_usuario(usuario_id: int, db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    u = db.get(Usuario, usuario_id)
    if u is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if u.email in TI_ADMIN_EMAILS:
        raise HTTPException(409, "No se puede eliminar un administrador institucional")
    if u.id == user["id"]:
        raise HTTPException(status_code=400, detail="No puede eliminar su propia cuenta")
    db.delete(u)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "El usuario tiene datos relacionados que impiden eliminarlo") from None
    return {"ok": True, "detail": "Usuario eliminado"}


# ---------------------------------------------------------------------------
# Endpoints: Tickets
# ---------------------------------------------------------------------------
@app.get("/api/tickets", response_model=List[TicketOut])
def list_tickets(db: Session = Depends(get_db), user: dict = Depends(_get_current_user)):
    q = db.query(Ticket)
    if user["rol"] not in TI_ROLES:
        q = q.filter(Ticket.solicitante_email == user["email"])
    rows = q.order_by(Ticket.id.desc()).all()
    return [_ticket_to_dict(t) for t in rows]


@app.post("/api/tickets", response_model=TicketOut)
def create_ticket(ticket: TicketIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db), user: dict = Depends(_get_current_user)):
    if ticket.solicitante_email != user["email"]:
        raise HTTPException(403, "No puede crear solicitudes en nombre de otra cuenta")
    # Resuelve el solicitante desde el directorio corporativo para obtener el
    # nombre completo (displayName) y su sede/perfil, sin insertarlo en la
    # gestión de usuarios TI (solo se usa como referencia del ticket).
    _usuario = db.query(Usuario).filter(Usuario.email == ticket.solicitante_email).first()
    solicitante_nombre = user["nombre"]
    perfil_colaborador = ticket.tipo_colaborador or (_usuario.tipo_colaborador if _usuario else None) or ""
    sede_origen = ticket.sede or (_usuario.sede.nombre if _usuario and _usuario.sede else None) or ""

    t = Ticket(
        codigo=_generar_codigo(db),
        solicitante_email=ticket.solicitante_email,
        user_name=solicitante_nombre,
        tipo_requerimiento=ticket.tipo_requerimiento,
        prioridad=ticket.prioridad,
        descripcion=ticket.descripcion,
        estado="Pendiente",
        tecnico_asignado=None,
        sede=sede_origen or ticket.sede,
        tipo_colaborador=perfil_colaborador or ticket.tipo_colaborador,
        notas_tecnicas=None,
        sede_id=ticket.sede_id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)

    # Notificación por correo al equipo de TI (en segundo plano)
    background_tasks.add_task(
        send_new_ticket_email,
        solicitante=t.user_name or t.solicitante_email,
        sede=t.sede or "Sin sede",
        categoria=t.tipo_requerimiento or "General",
        descripcion=t.descripcion or "",
        ticket_id=t.id,
        codigo=t.codigo,
    )

    # Alerta automática por WhatsApp al técnico principal (segundo plano y a
    # prueba de fallos: si el gateway no responde, el ticket ya está guardado).
    background_tasks.add_task(
        send_new_ticket_whatsapp,
        solicitante=t.user_name or t.solicitante_email,
        email=t.solicitante_email,
        sede=t.sede or "",
        perfil=t.tipo_colaborador or "",
        categoria=t.tipo_requerimiento or "",
        prioridad=t.prioridad or "",
        descripcion=t.descripcion or "",
        ticket_id=t.id,
        codigo=t.codigo,
    )
    return _ticket_to_dict(t)


@app.put("/api/tickets/{ticket_id}", response_model=TicketOut)
def update_ticket(ticket_id: int, ticket_update: TicketUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db), user: dict = Depends(require_ti)):
    t = db.get(Ticket, ticket_id)
    if t is None:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    estado_anterior = t.estado
    campos = ticket_update.model_fields_set
    if not campos:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    if "tecnico_asignado" in campos:
        raise HTTPException(
            status_code=400,
            detail="La asignación debe realizarse mediante tecnico_asignado_id",
        )
    if "nota_solucion" in campos and ticket_update.estado not in ("Solucionado", "Cerrado"):
        raise HTTPException(
            status_code=400,
            detail="La nota de solución solo se registra al solucionar o cerrar el ticket",
        )

    if ticket_update.estado is not None:
        if ticket_update.estado not in ESTADOS_TICKET:
            raise HTTPException(
                status_code=400,
                detail=f"Estado inválido. Valores permitidos: {', '.join(ESTADOS_TICKET)}",
            )
        if ticket_update.estado in ("Solucionado", "Cerrado"):
            nota_solucion = (ticket_update.nota_solucion or "").strip()
            if not nota_solucion:
                raise HTTPException(
                    status_code=400,
                    detail="Debe registrar una nota de solución antes de finalizar el ticket",
                )
            db.add(
                TicketNote(
                    ticket=t,
                    autor_id=user["id"],
                    autor_email=user["email"],
                    autor_nombre=user["nombre"] or user["email"],
                    contenido=nota_solucion,
                    tipo="solucion",
                    estado_resultante=ticket_update.estado,
                )
            )
        t.estado = ticket_update.estado
        if ticket_update.estado in ("Solucionado", "Cerrado"):
            if t.fecha_resolucion is None:
                t.fecha_resolucion = lima_now()
        elif estado_anterior in ("Solucionado", "Cerrado"):
            t.fecha_resolucion = None
    if "tecnico_asignado_id" in campos:
        if ticket_update.tecnico_asignado_id is None:
            t.tecnico_asignado_id = None
            t.tecnico_asignado = None
        else:
            tecnico = db.get(Usuario, ticket_update.tecnico_asignado_id)
            if tecnico is None:
                raise HTTPException(status_code=400, detail="El técnico indicado no existe")
            if tecnico.estado != "Activo" or tecnico.rol not in TI_ROLES:
                raise HTTPException(
                    status_code=400,
                    detail="El usuario indicado no es un técnico TI activo",
                )
            t.tecnico_asignado_id = tecnico.id
            t.tecnico_asignado = tecnico.nombre or tecnico.email
    if ticket_update.sede is not None:
        t.sede = ticket_update.sede
    if "notas_tecnicas" in campos:
        contenido = (ticket_update.notas_tecnicas or "").strip()
        if not contenido:
            raise HTTPException(status_code=400, detail="La nota técnica no puede estar vacía")
        db.add(
            TicketNote(
                ticket=t,
                autor_id=user["id"],
                autor_email=user["email"],
                autor_nombre=user["nombre"] or user["email"],
                contenido=contenido,
                tipo="tecnica",
                estado_resultante=t.estado,
            )
        )
    if "sede_id" in campos:
        if ticket_update.sede_id is not None and db.get(Sede, ticket_update.sede_id) is None:
            raise HTTPException(status_code=400, detail="La sede indicada no existe")
        t.sede_id = ticket_update.sede_id

    t.fecha_actualizacion = lima_now()
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="El ticket cambió durante la actualización. Recargue e intente nuevamente.",
        ) from None
    db.refresh(t)

    # Si el ticket pasó a "Solucionado", notificar al solicitante (segundo plano)
    if t.estado == "Solucionado" and estado_anterior != "Solucionado":
        background_tasks.add_task(
            send_ticket_resolved_email,
            requester=t.solicitante_email,
            ticket_id=t.id,
            categoria=t.tipo_requerimiento or "General",
        )

    return _ticket_to_dict(t)


@app.get("/api/tecnicos", response_model=List[dict])
def list_tecnicos(db: Session = Depends(get_db), user: dict = Depends(require_ti)):
    """Lista los técnicos del equipo TI disponibles para asignación."""
    rows = (
        db.query(Usuario)
        .filter(Usuario.rol.in_(TI_ROLES), Usuario.estado == "Activo")
        .order_by(Usuario.nombre)
        .all()
    )
    return [
        {
            "id": u.id,
            "nombre": u.nombre,
            "email": u.email,
            "telefono_whatsapp": u.telefono_whatsapp,
        }
        for u in rows
    ]


@app.post("/api/asistente")
def asistente(data: AsistenteIn, db: Session = Depends(get_db), user: dict = Depends(_get_current_user)):
    """Asistente virtual de primer nivel (soluciones frecuentes + DeepSeek)."""
    soluciones = buscar_soluciones(db, data.consulta)
    if soluciones:
        return {
            "soluciones": [
                {
                    "titulo": s.titulo,
                    "categoria": s.categoria,
                    "pasos": [p.strip() for p in (s.pasos or "").splitlines() if p.strip()],
                }
                for s in soluciones
            ],
            "respuesta_ia": "",
        }
    ia = consultar_deepseek(data.consulta)
    pasos = [p.strip() for p in ia.splitlines() if p.strip()] if ia else []
    return {
        "soluciones": [{"titulo": "Sugerencia del asistente", "categoria": "IA", "pasos": pasos}] if pasos else [],
        "respuesta_ia": ia,
    }


@app.get("/api/soluciones", response_model=List[SolucionOut])
def list_soluciones(db: Session = Depends(get_db), user: dict = Depends(require_ti)):
    """Lista la base de conocimiento (soluciones rápidas) para el equipo TI."""
    return db.query(SolucionFrecuente).order_by(SolucionFrecuente.id.desc()).all()


@app.post("/api/soluciones", response_model=SolucionOut)
def create_solucion(data: SolucionIn, db: Session = Depends(get_db), user: dict = Depends(require_ti)):
    s = SolucionFrecuente(
        titulo=data.titulo,
        palabras_clave=data.palabras_clave or "",
        pasos=data.pasos,
        categoria=data.categoria,
        activo=data.activo,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@app.put("/api/soluciones/{solucion_id}", response_model=SolucionOut)
def update_solucion(solucion_id: int, data: SolucionUpdate, db: Session = Depends(get_db), user: dict = Depends(require_ti)):
    s = db.get(SolucionFrecuente, solucion_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Solución no encontrada")
    if data.titulo is not None:
        s.titulo = data.titulo
    if data.palabras_clave is not None:
        s.palabras_clave = data.palabras_clave
    if data.pasos is not None:
        s.pasos = data.pasos
    if data.categoria is not None:
        s.categoria = data.categoria
    if data.activo is not None:
        s.activo = data.activo
    db.commit()
    db.refresh(s)
    return s


@app.delete("/api/soluciones/{solucion_id}")
def delete_solucion(solucion_id: int, db: Session = Depends(get_db), user: dict = Depends(require_ti)):
    s = db.get(SolucionFrecuente, solucion_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Solución no encontrada")
    db.delete(s)
    db.commit()
    return {"ok": True, "detail": "Solución eliminada"}


@app.get("/")
def root():
    return {"message": "Sistema IT Alianza API", "status": "ok"}
