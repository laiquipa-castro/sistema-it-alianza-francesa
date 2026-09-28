"""Script de carga inicial (seed) de soluciones frecuentes para el asistente.

Incluye soluciones comunes de primer nivel (impresoras, Wi-Fi, proyectores y
contraseñas). La función :func:`seed_soluciones` es idempotente: solo inserta
las soluciones que aún no existen.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from models import SolucionFrecuente

SOLUCIONES_INICIALES = [
    {
        "categoria": "Impresoras",
        "palabras_clave": "impresora, imprimir, tinta, toner, papel, atascado, no imprime",
        "titulo": "La impresora no imprime",
        "pasos": (
            "1. Verifica que la impresora esté encendida y conectada.\n"
            "2. Revisa que no tenga papel atascado ni falta de tinta/tóner.\n"
            "3. Confirma que esté seleccionada como impresora predeterminada.\n"
            "4. Reinicia la cola de impresión (servicio spooler).\n"
            "5. Si persiste, registra el ticket para soporte TI."
        ),
    },
    {
        "categoria": "Wi-Fi / Red",
        "palabras_clave": "wifi, internet, red, señal, conexion, lento, no navega, vpn",
        "titulo": "Problemas de conexión Wi-Fi",
        "pasos": (
            "1. Activa y desactiva el modo avión o el Wi-Fi del equipo.\n"
            "2. Olvida la red y vuelve a conectarte con tus credenciales.\n"
            "3. Pregunta a un compañero si el problema es general.\n"
            "4. Reinicia el equipo y el router si es posible.\n"
            "5. Si continúa, registra el ticket indicando tu sede."
        ),
    },
    {
        "categoria": "Proyectores",
        "palabras_clave": "proyector, proyeccion, pantalla, hdmi, no se ve, video, presentacion",
        "titulo": "El proyector no muestra imagen",
        "pasos": (
            "1. Verifica que el proyector esté encendido y en la fuente correcta (HDMI/VGA).\n"
            "2. Revisa el cable y prueba otro puerto.\n"
            "3. En Windows usa Win + P y elige 'Duplicar' o 'Extender'.\n"
            "4. Ajusta la resolución de pantalla del equipo.\n"
            "5. Si no se resuelve, crea el ticket indicando la sala."
        ),
    },
    {
        "categoria": "Contraseñas",
        "palabras_clave": "contraseña, clave, password, cuenta, correo, acceso, bloqueada, reset, restablecer",
        "titulo": "Restablecer contraseña de acceso",
        "pasos": (
            "1. Ingresa a '¿Olvidaste tu contraseña?' en la pantalla de acceso.\n"
            "2. Revisa tu correo @alianzafrancesa.org.pe para el enlace.\n"
            "3. Usa una clave segura (mayúsculas, números y símbolos).\n"
            "4. Si no recibes el correo, revisa la carpeta de spam.\n"
            "5. Si sigue bloqueada, registra el ticket para que TI la restablezca."
        ),
    },
]


def seed_soluciones(db: Session) -> None:
    """Inserta las soluciones frecuentes iniciales de forma idempotente."""
    for s in SOLUCIONES_INICIALES:
        existe = db.query(SolucionFrecuente).filter(SolucionFrecuente.titulo == s["titulo"]).first()
        if not existe:
            db.add(SolucionFrecuente(**s))
    db.commit()
