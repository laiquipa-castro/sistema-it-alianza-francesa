"""Configuración central de la aplicación (variables de entorno).

Punto único de lectura de configuración de despliegue: pasar de desarrollo
local a producción solo requiere actualizar el archivo ``.env`` (sin tocar
código).
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


# ---------------------------------------------------------------------------
# CORS y URLs de despliegue
# ---------------------------------------------------------------------------
# Orígenes permitidos por el frontend (separados por coma).
CORS_ORIGINS: list[str] = _csv(
    os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
)

# URL pública del portal (usada para enlaces dentro de los correos).
APP_URL: str = os.getenv("APP_URL", "http://localhost:3000").rstrip("/")

# URL pública del backend.
BACKEND_URL: str = os.getenv("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")

# Dominio corporativo permitido para autenticación Google OAuth.
ALLOWED_EMAIL_DOMAIN: str = os.getenv("ALLOWED_EMAIL_DOMAIN", "@alianzafrancesa.org.pe")


# ---------------------------------------------------------------------------
# SMTP (correo saliente)
# ---------------------------------------------------------------------------
SMTP_HOST: str = os.getenv("SMTP_HOST", "")
SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER: str = os.getenv("SMTP_USER", "")
SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM: str = os.getenv("SMTP_FROM", SMTP_USER or "soporte-ti@alianzafrancesa.org.pe")
SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").strip().lower() in ("1", "true", "yes")


# ---------------------------------------------------------------------------
# Equipo de TI (destinatarios de las notificaciones de nuevos tickets)
# ---------------------------------------------------------------------------
TI_TEAM_EMAILS: list[str] = [
    "j.salas@alianzafrancesa.org.pe",
    "a.alcantara@alianzafrancesa.org.pe",
    "j.barbaran@alianzafrancesa.org.pe",
    "l.aiquipa-castro@alianzafrancesa.org.pe",
]
