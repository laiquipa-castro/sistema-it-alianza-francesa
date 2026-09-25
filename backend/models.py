"""Modelos ORM (SQLAlchemy) agnósticos al motor de base de datos.

Los tipos declarados aquí (Integer, String, Text, DateTime, ForeignKey, ...)
son genéricos de SQLAlchemy, por lo que el mismo código funciona sin cambios
sobre SQLite (desarrollo) y sobre MySQL/PostgreSQL (producción).
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


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

    # Relación (N -> 1)
    sede: Mapped[Optional["Sede"]] = relationship(back_populates="usuarios")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Usuario id={self.id} email={self.email!r} rol={self.rol!r}>"


class Ticket(Base):
    """Tickets de soporte TI."""

    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    solicitante_email: Mapped[str] = mapped_column(String(255), nullable=False)
    tipo_requerimiento: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    prioridad: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Pendiente", index=True
    )
    tecnico_asignado: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    notas_tecnicas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.now, index=True
    )
    # Campo legacy (texto libre) conservado por compatibilidad con datos previos.
    sede: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    tipo_colaborador: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # Relación normalizada hacia la tabla de sedes (N -> 1).
    sede_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sedes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sede_rel: Mapped[Optional["Sede"]] = relationship(back_populates="tickets")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Ticket id={self.id} estado={self.estado!r}>"
