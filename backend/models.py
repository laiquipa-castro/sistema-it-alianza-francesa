"""Modelos ORM (SQLAlchemy) agnósticos al motor de base de datos.

Los tipos declarados aquí (Integer, String, Text, DateTime, ForeignKey, ...)
son genéricos de SQLAlchemy, por lo que el mismo código funciona sin cambios
sobre SQLite (desarrollo) y sobre MySQL/PostgreSQL (producción).
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

LIMA_TZ = ZoneInfo("America/Lima")


def lima_now() -> datetime:
    """Fecha consciente de zona horaria para todos los eventos de tickets."""
    return datetime.now(LIMA_TZ)


class Sede(Base):
    """Sedes de la Alianza Francesa donde se ubican los colaboradores."""

    __tablename__ = "sedes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    tipo: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    # Relaciones (1 -> N)
    usuarios: Mapped[list["Usuario"]] = relationship(back_populates="sede")
    tickets: Mapped[list["Ticket"]] = relationship(back_populates="sede_rel")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Sede id={self.id} nombre={self.nombre!r}>"


class Usuario(Base):
    """Usuarios (colaboradores) del sistema, con su sede asignada."""

    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    nombre: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True, index=True)
    rol: Mapped[str] = mapped_column(
        String(60), nullable=False, default="Usuario", index=True
    )
    estado: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Activo"
    )
    tipo_colaborador: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    sede_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sedes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    cargo_ti: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    telefono_whatsapp: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # Relación (N -> 1)
    sede: Mapped[Optional["Sede"]] = relationship(back_populates="usuarios")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Usuario id={self.id} email={self.email!r} rol={self.rol!r}>"


class Ticket(Base):
    """Tickets de soporte TI."""

    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    solicitante_email: Mapped[str] = mapped_column(String(255), nullable=False)
    user_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tipo_requerimiento: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    prioridad: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Pendiente", index=True
    )
    tecnico_asignado: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tecnico_asignado_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notas_tecnicas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lima_now, index=True
    )
    fecha_actualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lima_now, onupdate=lima_now
    )
    fecha_resolucion: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    codigo: Mapped[Optional[str]] = mapped_column(
        String(30), nullable=True, unique=True, index=True
    )
    # Campo legacy (texto libre) conservado por compatibilidad con datos previos.
    sede: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tipo_colaborador: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # Relación normalizada hacia la tabla de sedes (N -> 1).
    sede_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sedes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sede_rel: Mapped[Optional["Sede"]] = relationship(back_populates="tickets")
    notas: Mapped[list["TicketNote"]] = relationship(
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketNote.fecha_creacion",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Ticket id={self.id} estado={self.estado!r}>"


class TicketNote(Base):
    """Entrada inmutable del historial técnico de un ticket."""

    __tablename__ = "ticket_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    autor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True
    )
    autor_email: Mapped[str] = mapped_column(String(255), nullable=False)
    autor_nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    contenido: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False, default="tecnica")
    estado_resultante: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lima_now, index=True
    )

    ticket: Mapped["Ticket"] = relationship(back_populates="notas")


class SolucionFrecuente(Base):
    """Soluciones frecuentes para el asistente virtual de primer nivel."""

    __tablename__ = "soluciones_frecuentes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    categoria: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    palabras_clave: Mapped[str] = mapped_column(String(255), nullable=False)
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    pasos: Mapped[str] = mapped_column(Text, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<SolucionFrecuente id={self.id} titulo={self.titulo!r}>"
