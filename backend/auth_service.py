"""Identidad Google verificada en servidor; nunca confiar en un email del cliente."""
from functools import partial
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport.requests import Request
from google.oauth2 import id_token

from config import ALLOWED_EMAIL_DOMAIN, GOOGLE_CLIENT_ID

bearer = HTTPBearer(auto_error=False)


def verified_google_identity(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Se requiere iniciar sesión con Google", headers={"WWW-Authenticate": "Bearer"})
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Autenticación Google no configurada")
    try:
        claims = id_token.verify_oauth2_token(
            credentials.credentials,
            partial(Request(), timeout=10),
            audience=GOOGLE_CLIENT_ID,
        )
    except TransportError:
        raise HTTPException(503, "No se pudo verificar Google. Intente nuevamente.") from None
    except (ValueError, GoogleAuthError):
        raise HTTPException(401, "Token de Google inválido o vencido", headers={"WWW-Authenticate": "Bearer"}) from None

    domain = ALLOWED_EMAIL_DOMAIN.lstrip("@").strip().lower()
    email = str(claims.get("email", "")).strip().lower()
    hosted_domain = str(claims.get("hd", "")).strip().lower()
    if (
        not domain
        or claims.get("email_verified") is not True
        or hosted_domain != domain
        or email.count("@") != 1
        or not email.split("@")[0]
        or email.rsplit("@", 1)[-1] != domain
    ):
        raise HTTPException(403, "Se requiere una cuenta verificada del dominio corporativo")
    if not isinstance(claims.get("sub"), str) or not claims["sub"]:
        raise HTTPException(401, "Identidad Google inválida")
    return {"email": email, "sub": claims["sub"], "nombre": claims.get("name")}
