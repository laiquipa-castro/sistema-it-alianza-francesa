"""API principal del Sistema IT Alianza (FastAPI + SQLAlchemy ORM).

La capa de datos está desacoplada en :mod:`database`, :mod:`models` y
:mod:`schemas`, por lo que este módulo solo orquesta la lógica HTTP y de
negocio de forma agnóstica al motor de base de datos.
"""
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import List, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

import models  # noqa: F401  # registra los modelos en Base.metadata
from database import Base, SessionLocal, engine, get_db, init_db
from models import Sede, SolucionFrecuente, Ticket, Usuario
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
    VerificarIn,
    validar_dominio,
)
from config import CORS_ORIGINS
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
        "email": "jesus.barbaran@alianzafrancesa.org.pe",
        "nombre": "JESÚS ALBERTO BARBARÁN ROJAS",
        "rol": "HELPDESK_TI",
        "estado": "Activo",
        "tipo_colaborador": "Administrativo",
        "sede": "Miraflores",
        "cargo_ti": "Help Desk TI",
    },
    {
        "email": "jhon.salas@alianzafrancesa.org.pe",
        "nombre": "JHON SALAS TAYPE",
        "rol": "ARQUITECTO_TI",
        "estado": "Activo",
        "tipo_colaborador": "Administrativo",
        "sede": "Miraflores",
        "cargo_ti": "Arquitecto de Soluciones TI",
    },
    {
        "email": "adrian.alcantara@alianzafrancesa.org.pe",
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
        "fecha_creacion": t.fecha_creacion,
        "sede_id": t.sede_id,
        "codigo": t.codigo,
        "fecha_resolucion": t.fecha_resolucion,
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
        if "tecnico_asignado_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN tecnico_asignado_id INTEGER"))
        if "user_name" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE tickets ADD COLUMN user_name VARCHAR(255)"))

    if "usuarios" in tablas:
        cols = {c["name"] for c in insp.get_columns("usuarios")}
        if "telefono_whatsapp" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE usuarios ADD COLUMN telefono_whatsapp VARCHAR(30)"))


def seed_data(db: Session) -> None:
    """Inserta las sedes y usuarios iniciales de forma idempotente."""
    for nombre, tipo in SEDES_INICIALES:
        if not db.query(Sede).filter(Sede.nombre == nombre).first():
            db.add(Sede(nombre=nombre, tipo=tipo))
    db.flush()

    sede_ids = {s.nombre: s.id for s in db.query(Sede).all()}

    for u in USUARIOS_INICIALES:
        existing = db.query(Usuario).filter(Usuario.email == u["email"]).first()
        if existing is None:
            existing = Usuario(email=u["email"])
            db.add(existing)
        existing.nombre = u["nombre"]
        existing.rol = u["rol"]
        existing.estado = u["estado"]
        existing.tipo_colaborador = u["tipo_colaborador"]
        existing.sede_id = sede_ids.get(u["sede"])
        existing.cargo_ti = u["cargo_ti"]
        existing.telefono_whatsapp = u.get("telefono_whatsapp")
    db.commit()

    seed_soluciones(db)


# ---------------------------------------------------------------------------
# Autorización basada en roles (RBAC)
# ---------------------------------------------------------------------------
def _get_current_user(
    x_user_email: Optional[str] = Header(default=None, alias="X-User-Email"),
    db: Session = Depends(get_db),
) -> dict:
    """Resuelve el usuario autenticado a partir del encabezado X-User-Email."""
    if not x_user_email or not validar_dominio(x_user_email):
        raise HTTPException(status_code=401, detail="No autenticado")
    u = (
        db.query(Usuario)
        .options(joinedload(Usuario.sede))
        .filter(Usuario.email == x_user_email.strip().lower())
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
def verify_user(data: VerificarIn, db: Session = Depends(get_db)):
    """Verifica el dominio y auto-registra al usuario si es la primera vez."""
    if not validar_dominio(data.email):
        raise HTTPException(
            status_code=403,
            detail="Acceso restringido: solo se permiten correos @alianzafrancesa.org.pe",
        )

    email = data.email.strip().lower()
    u = (
        db.query(Usuario)
        .options(joinedload(Usuario.sede))
        .filter(Usuario.email == email)
        .first()
    )

    if u is None:
        # Auto-registro como Usuario corporativo genérico
        u = Usuario(email=email, nombre=data.nombre, rol="Usuario", estado="Activo")
        db.add(u)
        db.commit()
        db.refresh(u)

    if u.estado != "Activo":
        raise HTTPException(status_code=403, detail="Usuario suspendido. Contacte a Sistemas.")

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
def list_usuarios(db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    """Lista únicamente al personal técnico (roles TI)."""
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

    u = Usuario(
        email=usuario.email,
        nombre=usuario.nombre,
        rol=usuario.rol,
        estado=usuario.estado,
        tipo_colaborador=usuario.tipo_colaborador,
        sede_id=usuario.sede_id,
        cargo_ti=usuario.cargo_ti,
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

    for campo in ["nombre", "rol", "estado", "tipo_colaborador", "sede_id", "cargo_ti"]:
        valor = getattr(update, campo)
        if valor is not None:
            setattr(u, campo, valor)

    db.commit()
    db.refresh(u)
    return _usuario_to_dict(u)


@app.delete("/api/usuarios/{usuario_id}", response_model=dict)
def delete_usuario(usuario_id: int, db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    u = db.get(Usuario, usuario_id)
    if u is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if u.id == user["id"]:
        raise HTTPException(status_code=400, detail="No puede eliminar su propia cuenta")
    db.delete(u)
    db.commit()
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
def create_ticket(ticket: TicketIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # Resuelve el solicitante desde el directorio corporativo para obtener el
    # nombre completo (displayName) y su sede/perfil, sin insertarlo en la
    # gestión de usuarios TI (solo se usa como referencia del ticket).
    _usuario = db.query(Usuario).filter(Usuario.email == ticket.solicitante_email).first()
    solicitante_nombre = (ticket.user_name or (_usuario.nombre if _usuario else None))
    perfil_colaborador = ticket.tipo_colaborador or (_usuario.tipo_colaborador if _usuario else None) or ""
    sede_origen = ticket.sede or (_usuario.sede.nombre if _usuario and _usuario.sede else None) or ""

    t = Ticket(
        codigo=_generar_codigo(db),
        solicitante_email=ticket.solicitante_email,
        user_name=solicitante_nombre,
        tipo_requerimiento=ticket.tipo_requerimiento,
        prioridad=ticket.prioridad,
        descripcion=ticket.descripcion,
        estado=ticket.estado,
        tecnico_asignado=ticket.tecnico_asignado,
        sede=sede_origen or ticket.sede,
        tipo_colaborador=perfil_colaborador or ticket.tipo_colaborador,
        notas_tecnicas=ticket.notas_tecnicas,
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

    if (
        ticket_update.estado is None
        and ticket_update.tecnico_asignado is None
        and ticket_update.sede is None
        and ticket_update.notas_tecnicas is None
        and ticket_update.sede_id is None
        and ticket_update.tecnico_asignado_id is None
    ):
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    if ticket_update.estado is not None:
        if ticket_update.estado not in ESTADOS_TICKET:
            raise HTTPException(
                status_code=400,
                detail=f"Estado inválido. Valores permitidos: {', '.join(ESTADOS_TICKET)}",
            )
        t.estado = ticket_update.estado
        if ticket_update.estado == "Solucionado":
            t.fecha_resolucion = datetime.now()
    if ticket_update.tecnico_asignado is not None:
        t.tecnico_asignado = ticket_update.tecnico_asignado
    if ticket_update.tecnico_asignado_id is not None:
        t.tecnico_asignado_id = ticket_update.tecnico_asignado_id
        tecnico = db.get(Usuario, ticket_update.tecnico_asignado_id)
        if tecnico:
            t.tecnico_asignado = tecnico.nombre
    if ticket_update.sede is not None:
        t.sede = ticket_update.sede
    if ticket_update.notas_tecnicas is not None:
        t.notas_tecnicas = ticket_update.notas_tecnicas
    if ticket_update.sede_id is not None:
        t.sede_id = ticket_update.sede_id

    db.commit()
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
        .filter(Usuario.rol.in_(TI_ROLES))
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
def asistente(data: AsistenteIn, db: Session = Depends(get_db)):
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
