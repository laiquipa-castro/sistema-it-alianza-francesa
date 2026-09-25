"""Conexión a la base de datos (agnóstica al motor).

Este módulo centraliza la configuración del motor de SQLAlchemy para que el
backend funcione de forma transparente sobre SQLite (desarrollo local) y sobre
MySQL/PostgreSQL (producción), cambiando únicamente la variable de entorno
``DATABASE_URL``.

Configuración según el motor:

    SQLite (por defecto):
        sqlite:///./sistema_it.db

    MySQL (requiere ``pip install pymysql``):
        mysql+pymysql://usuario:clave@host:3306/sistema_it

    PostgreSQL (requiere ``pip install psycopg2-binary``):
        postgresql+psycopg2://usuario:clave@host:5432/sistema_it
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# ---------------------------------------------------------------------------
# Carga de variables de entorno (.env)
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sistema_it.db")


def _es_sqlite(url: str) -> bool:
    """Indica si la URL de conexión corresponde a SQLite."""
    return url.startswith("sqlite")


# ---------------------------------------------------------------------------
# Motor de base de datos
# ---------------------------------------------------------------------------
# Para SQLite, ``check_same_thread=False`` permite usar la conexión desde los
# hilos de los workers de ASGI/FastAPI.
connect_args = {"check_same_thread": False} if _es_sqlite(DATABASE_URL) else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,   # valida que la conexión siga viva (útil en producción)
)


# ---------------------------------------------------------------------------
# Soporte de claves foráneas en SQLite
# ---------------------------------------------------------------------------
@event.listens_for(engine, "connect")
def _habilitar_foreign_keys(dbapi_connection, connection_record):
    """Activa ``PRAGMA foreign_keys=ON`` en cada conexión SQLite."""
    if _es_sqlite(DATABASE_URL):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


# ---------------------------------------------------------------------------
# Sesión y Base declarativa
# ---------------------------------------------------------------------------
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Base declarativa común para todos los modelos ORM."""


def get_db():
    """Dependencia de FastAPI que provee una sesión y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Crea las tablas e índices definidos en los modelos (idempotente)."""
    import models  # noqa: F401  # registra los modelos en Base.metadata

    Base.metadata.create_all(bind=engine)

    # Asegura los índices también en tablas ya existentes (migración ligera),
    # de forma idempotente y agnóstica al motor de base de datos.
    for table in Base.metadata.tables.values():
        for index in table.indexes:
            index.create(bind=engine, checkfirst=True)
