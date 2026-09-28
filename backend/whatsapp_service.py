"""Servicio de alertas WhatsApp integrado con BackgroundTasks.

Envía notificaciones automáticas al técnico principal cuando se crea un nuevo
ticket. Usa ``urllib`` (stdlib) para no añadir dependencias y está envuelto en
``try/except``: si el gateway no está configurado o falla, la creación del
ticket NO se bloquea (el error se registra en consola y se ignora).
"""
from __future__ import annotations

import urllib.parse
import urllib.request
from typing import Optional

from config import APP_URL, WHATSAPP_API_KEY, WHATSAPP_API_URL, WHATSAPP_TECH_PHONE


def _normalizar_telefono(telefono: str) -> str:
    """Conserva solo dígitos y antepone el prefijo internacional si falta."""
    digitos = "".join(c for c in telefono if c.isdigit())
    if not digitos.startswith("5") and len(digitos) < 12:
        digitos = "51" + digitos
    return digitos


def send_whatsapp(telefono: str, mensaje: str) -> bool:
    """Envía un mensaje de texto por el gateway de WhatsApp configurado.

    Retorna True si se envió correctamente; False si no hay gateway o falló.
    """
    if not WHATSAPP_API_URL:
        print("[WHATSAPP] Gateway no configurado — se omite el envío.")
        return False

    try:
        params = urllib.parse.urlencode(
            {
                "phone": _normalizar_telefono(telefono),
                "text": mensaje,
                "apikey": WHATSAPP_API_KEY,
            }
        )
        url = f"{WHATSAPP_API_URL}?{params}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: F841
            resp.read()
        print(f"[WHATSAPP] Enviado a {telefono}")
        return True
    except Exception as exc:  # pragma: no cover
        print(f"[WHATSAPP] Error al enviar a {telefono}: {exc}")
        return False


def send_new_ticket_whatsapp(
    *,
    solicitante: str,
    email: str,
    sede: str,
    perfil: str,
    categoria: str,
    prioridad: str,
    descripcion: str,
    ticket_id: int,
    codigo: Optional[str] = None,
    telefono: Optional[str] = None,
) -> bool:
    """Notifica al técnico principal la creación de un nuevo ticket."""
    correlativo = f"{codigo} · Ticket #{ticket_id}" if codigo else f"Ticket #{ticket_id}"
    gestion = f"{APP_URL}/admin/tickets/{ticket_id}"
    mensaje = (
        "🚨 *NUEVA SOLICITUD DE SOPORTE TI*\n\n"
        f"📌 *Código:* {correlativo}\n"
        f"👤 *Solicitante:* {solicitante}\n"
        f"📧 *Correo:* {email}\n"
        f"🏢 *Sede:* {sede or '—'}\n"
        f"💼 *Perfil:* {perfil or '—'}\n"
        f"📂 *Categoría:* {categoria or '—'}\n"
        f"⚠️ *Prioridad:* {prioridad or '—'}\n\n"
        "📝 *Solicitud:*\n"
        f"\"{descripcion or 'Sin detalle'}\"\n\n"
        f"🔗 *Gestionar:* {gestion}"
    )
    return send_whatsapp(telefono or WHATSAPP_TECH_PHONE, mensaje)
