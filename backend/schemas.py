"""Esquemas Pydantic (v2) para validación y serialización de la API.

Los esquemas de salida (``*Out``) heredan de :class:`ORMModel`, que habilita
``from_attributes`` para poder construirlos directamente desde objetos ORM.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from config import ALLOWED_EMAIL_DOMAIN

# ---------------------------------------------------------------------------
# Constantes de dominio y valores permitidos
# ---------------------------------------------------------------------------
DOMINIO_PERMITIDO = ALLOWED_EMAIL_DOMAIN

ROLES_VALIDOS = [
    "ADMIN_TI",
    "HELPDESK_TI",
    "ARQUITECTO_TI",
    "INFRAESTRUCTURA_TI",
    "Usuario",
]
ESTADOS_VALIDOS = ["Activo", "Suspendido"]
TIPOS_COLABORADOR = ["Administrativo", "Docente"]
ESTADOS_TICKET = ["Pendiente", "En Proceso", "Solucionado", "Cerrado"]


def validar_dominio(email: str) -> bool:
    """Valida estrictamente que el correo pertenezca al dominio corporativo."""
    if not email:
        return False
    return email.strip().lower().endswith(DOMINIO_PERMITIDO)


class ORMModel(BaseModel):
    """Base para esquemas de salida que se construyen desde objetos ORM."""

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Sedes
# ---------------------------------------------------------------------------
class SedeIn(BaseModel):
    nombre: str
    tipo: Optional[str] = None


class SedeOut(ORMModel):
    id: int
    nombre: str
    tipo: Optional[str] = None


# ---------------------------------------------------------------------------
# Usuarios
# ---------------------------------------------------------------------------
class UsuarioIn(BaseModel):
    email: str
    nombre: Optional[str] = None
    rol: str = "Usuario"
    estado: str = "Activo"
    tipo_colaborador: Optional[str] = None
    sede_id: Optional[int] = None
    cargo_ti: Optional[str] = None
    telefono_whatsapp: Optional[str] = None

    @field_validator("email")
    @classmethod
    def _validar_email(cls, v):
        if not validar_dominio(v):
            raise ValueError(
                "Acceso restringido: solo se permiten correos @alianzafrancesa.org.pe"
            )
        return v.strip().lower()

    @field_validator("rol")
    @classmethod
    def _validar_rol(cls, v):
        if v not in ROLES_VALIDOS:
            raise ValueError(f"Rol inválido. Valores permitidos: {ROLES_VALIDOS}")
        return v

    @field_validator("estado")
    @classmethod
    def _validar_estado(cls, v):
        if v not in ESTADOS_VALIDOS:
            raise ValueError(f"Estado inválido. Valores permitidos: {ESTADOS_VALIDOS}")
        return v


class UsuarioUpdate(BaseModel):
    email: Optional[str] = None
    nombre: Optional[str] = None
    rol: Optional[str] = None
    estado: Optional[str] = None
    tipo_colaborador: Optional[str] = None
    sede_id: Optional[int] = None
    cargo_ti: Optional[str] = None

    @field_validator("email")
    @classmethod
    def _validar_email(cls, v):
        if v is None:
            return v
        if not validar_dominio(v):
            raise ValueError(
                "Acceso restringido: solo se permiten correos @alianzafrancesa.org.pe"
            )
        return v.strip().lower()


class UsuarioOut(ORMModel):
    id: int
    email: str
    nombre: Optional[str] = None
    rol: str
    estado: str
    tipo_colaborador: Optional[str] = None
    sede_id: Optional[int] = None
    sede_nombre: Optional[str] = None
    cargo_ti: Optional[str] = None
    telefono_whatsapp: Optional[str] = None


# ---------------------------------------------------------------------------
# Autenticación / Verificación
# ---------------------------------------------------------------------------
class VerificarIn(BaseModel):
    email: str
    nombre: Optional[str] = None


class AsistenteIn(BaseModel):
    consulta: str


class SolucionIn(BaseModel):
    titulo: str
    palabras_clave: Optional[str] = None
    pasos: str
    categoria: str
    activo: bool = True


class SolucionUpdate(BaseModel):
    titulo: Optional[str] = None
    palabras_clave: Optional[str] = None
    pasos: Optional[str] = None
    categoria: Optional[str] = None
    activo: Optional[bool] = None


class SolucionOut(ORMModel):
    id: int
    categoria: str
    palabras_clave: str
    titulo: str
    pasos: str
    activo: bool


# ---------------------------------------------------------------------------
# Tickets
# ---------------------------------------------------------------------------
class TicketIn(BaseModel):
    solicitante_email: str
    user_name: Optional[str] = None
    tipo_requerimiento: Optional[str] = None
    prioridad: Optional[str] = None
    descripcion: Optional[str] = None
    estado: Optional[str] = "Pendiente"
    tecnico_asignado: Optional[str] = None
    sede: Optional[str] = None
    tipo_colaborador: Optional[str] = None
    notas_tecnicas: Optional[str] = None
    sede_id: Optional[int] = None

    @field_validator("solicitante_email")
    @classmethod
    def _validar_email(cls, v):
        if not validar_dominio(v):
            raise ValueError(
                "Acceso restringido: solo se permiten correos @alianzafrancesa.org.pe"
            )
        return v.strip().lower()


class TicketUpdate(BaseModel):
    estado: Optional[str] = None
    tecnico_asignado: Optional[str] = None
    tecnico_asignado_id: Optional[int] = None
    sede: Optional[str] = None
    notas_tecnicas: Optional[str] = None
    sede_id: Optional[int] = None


class TicketOut(ORMModel):
    id: int
    solicitante_email: str
    user_name: Optional[str] = None
    tipo_requerimiento: Optional[str] = None
    prioridad: Optional[str] = None
    descripcion: Optional[str] = None
    estado: Optional[str] = None
    tecnico_asignado: Optional[str] = None
    tecnico_asignado_id: Optional[int] = None
    sede: Optional[str] = None
    tipo_colaborador: Optional[str] = None
    notas_tecnicas: Optional[str] = None
    fecha_creacion: Optional[datetime] = None
    sede_id: Optional[int] = None
    codigo: Optional[str] = None
    fecha_resolucion: Optional[datetime] = None
