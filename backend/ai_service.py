"""Servicio de IA para el asistente virtual de primer nivel.

Combina la búsqueda en soluciones frecuentes locales con una consulta opcional
a la API de DeepSeek (si ``DEEPSEEK_API_KEY`` está configurada). No falla si la
clave no está presente o si el servicio externo no responde.
"""
from __future__ import annotations

import json
import urllib.request

from sqlalchemy.orm import Session

from config import DEEPSEEK_API_KEY, DEEPSEEK_MODEL
from models import SolucionFrecuente


def buscar_soluciones(db: Session, consulta: str) -> list[SolucionFrecuente]:
    """Busca soluciones frecuentes cuyas palabras clave coincidan con la consulta."""
    consulta = (consulta or "").strip().lower()
    if not consulta:
        return []
    rows = db.query(SolucionFrecuente).filter(SolucionFrecuente.activo.is_(True)).all()
    matches = []
    for s in rows:
        claves = [k.strip() for k in (s.palabras_clave or "").split(",") if k.strip()]
        if any(k in consulta for k in claves) or consulta in (s.categoria or "").lower():
            matches.append(s)
    return matches


def consultar_deepseek(consulta: str) -> str:
    """Consulta a DeepSeek y devuelve un paso a paso en texto plano (o '')."""
    if not DEEPSEEK_API_KEY:
        return ""
    try:
        body = json.dumps(
            {
                "model": DEEPSEEK_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Eres el asistente de primer nivel de la mesa de ayuda TI. "
                            "Responde con un paso a paso breve y numerado."
                        ),
                    },
                    {"role": "user", "content": consulta},
                ],
                "temperature": 0.3,
                "max_tokens": 500,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            "https://api.deepseek.com/chat/completions",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            },
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip()
    except Exception as exc:  # pragma: no cover
        print(f"[DEEPSEEK] Error: {exc}")
        return ""
