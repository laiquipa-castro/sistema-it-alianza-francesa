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
# URL pública del frontend (Vercel), usada para habilitar CORS en producción.
FRONTEND_URL: str = os.getenv("FRONTEND_URL", "").rstrip("/")

# Portal oficial. Se conserva como origen confiable incluso si Render define
# CORS_ORIGINS="*" o deja FRONTEND_URL vacío por error de configuración.
TRUSTED_FRONTEND_ORIGINS: tuple[str, ...] = (
    "https://sistema-it-alianza-francesa.vercel.app",
)

# Orígenes permitidos por el frontend (separados por coma).
CORS_ORIGINS: list[str] = _csv(
    os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
)

# Se agrega el frontend configurado y se descarta cualquier comodín para que
# navegadores de orígenes desconocidos no puedan consumir la API.
CORS_ORIGINS = [origin for origin in CORS_ORIGINS if origin != "*"]
for origin in (*TRUSTED_FRONTEND_ORIGINS, FRONTEND_URL):
    if origin and origin not in CORS_ORIGINS:
        CORS_ORIGINS.append(origin)

# URL pública del portal (usada para enlaces dentro de los correos).
APP_URL: str = os.getenv("APP_URL", "http://localhost:3000").rstrip("/")

# URL pública del backend.
BACKEND_URL: str = os.getenv("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")

# Dominio corporativo permitido para autenticación Google OAuth.
ALLOWED_EMAIL_DOMAIN: str = os.getenv("ALLOWED_EMAIL_DOMAIN", "@alianzafrancesa.org.pe")
GOOGLE_CLIENT_ID: str = os.getenv(
    "GOOGLE_CLIENT_ID",
    "274739568755-s1kq1q8orh7e3edneubiahgimtrgvrgi.apps.googleusercontent.com",
).strip()


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


# ---------------------------------------------------------------------------
# WhatsApp (alertas automáticas de nuevos tickets)
# ---------------------------------------------------------------------------
# URL base del gateway de WhatsApp (ej. CallMeBot: https://api.callmebot.com/whatsapp.php).
# Si está vacío, el envío se omite de forma segura (sin bloquear la creación del ticket).
WHATSAPP_API_URL: str = os.getenv("WHATSAPP_API_URL", "")
WHATSAPP_API_KEY: str = os.getenv("WHATSAPP_API_KEY", "")
WHATSAPP_TECH_PHONE: str = os.getenv("WHATSAPP_TECH_PHONE", "+51986068159")


# ---------------------------------------------------------------------------
# IA / Asistente virtual (DeepSeek)
# ---------------------------------------------------------------------------
# Clave opcional para consultar DeepSeek cuando no hay solución frecuente local.
DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_MODEL: str = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
