"""Servicio de correo electrónico (SMTP) integrado con BackgroundTasks.

Usa ``smtplib`` (stdlib) para el envío y se invoca desde
``fastapi.BackgroundTasks`` para no bloquear la respuesta HTTP. Si el SMTP no
está configurado (entorno de desarrollo), registra el correo en consola y no
falla.
"""
from __future__ import annotations

import html
import smtplib
from email.message import EmailMessage
from typing import List

from config import (
    APP_URL,
    SMTP_FROM,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USE_TLS,
    SMTP_USER,
    TI_TEAM_EMAILS,
)


def _smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def send_email(recipients: List[str], subject: str, html_body: str) -> bool:
    """Envía un correo HTML a la lista de destinatarios. Retorna True si se envió."""
    recipients = [r for r in recipients if r]
    if not recipients:
        return False

    if not _smtp_configured():
        print(f"[EMAIL] SMTP no configurado — salto el envío. Para={recipients} | Asunto={subject}")
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = ", ".join(recipients)
    msg.set_content("Este correo requiere un cliente compatible con HTML.")
    msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
            if SMTP_USE_TLS:
                server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        print(f"[EMAIL] Enviado a {recipients} | Asunto={subject}")
        return True
    except Exception as exc:  # pragma: no cover
        print(f"[EMAIL] Error al enviar a {recipients}: {exc}")
        return False


def _base_html(title: str, content: str) -> str:
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;'
        'max-width:640px">'
        f'<h2 style="color:#002395">{html.escape(title)}</h2>'
        f"{content}"
        "</div>"
    )


def send_new_ticket_email(
    *,
    solicitante: str,
    sede: str,
    categoria: str,
    descripcion: str,
    ticket_id: int,
) -> bool:
    """Notifica a todo el equipo de TI la creación de un nuevo ticket."""
    subject = f"[NUEVO TICKET TI] - Sede: {sede} - {categoria}"
    link = f"{APP_URL}/?ticket={ticket_id}"
    content = (
        "<p><strong>Ticket:</strong> "
        f"#{ticket_id}</p>"
        f"<p><strong>Remitente:</strong> {html.escape(solicitante)}</p>"
        f"<p><strong>Sede:</strong> {html.escape(sede)}</p>"
        f"<p><strong>Categoría:</strong> {html.escape(categoria)}</p>"
        "<p><strong>Detalle del requerimiento:</strong></p>"
        f"<p>{html.escape(descripcion)}</p>"
        f'<p><a href="{html.escape(link, quote=True)}" '
        'style="display:inline-block;padding:10px 16px;background:#ED1C24;'
        'color:#ffffff;text-decoration:none;border-radius:6px">Atender solicitud</a></p>'
    )
    return send_email(
        TI_TEAM_EMAILS,
        subject,
        _base_html("Nuevo requerimiento de Soporte TI", content),
    )


def send_ticket_resolved_email(
    *,
    requester: str,
    ticket_id: int,
    categoria: str,
) -> bool:
    """Notifica al solicitante que su ticket fue marcado como RESUELTO."""
    subject = "[TICKET RESUELTO] Su solicitud ha sido atendida"
    content = (
        "<p>Estimado/a colaborador/a,</p>"
        f"<p>Su solicitud <strong>#{ticket_id}</strong> "
        f"({html.escape(categoria)}) ha sido <strong>atendida y marcada como RESUELTA</strong>.</p>"
        f'<p>Puede revisar el detalle en: <a href="{APP_URL}">{APP_URL}</a></p>'
        "<p>Gracias por usar el portal de Soporte TI.</p>"
    )
    return send_email(
        [requester],
        subject,
        _base_html("Solicitud atendida", content),
    )
