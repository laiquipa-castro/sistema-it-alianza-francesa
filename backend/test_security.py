"""Regresiones de seguridad para identidad, roles y gestión de usuarios."""
import os
import unittest
from datetime import datetime
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

import auth_service
import database

_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
database.engine = _engine
database.SessionLocal.configure(bind=_engine)

import main

main.engine = _engine


class SecurityRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(main.app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        main.app.dependency_overrides.clear()
        cls.client_context.__exit__(None, None, None)

    def setUp(self):
        main.app.dependency_overrides.clear()

    def authenticate_as(self, email: str, subject: str) -> dict:
        identity = {"email": email, "sub": subject, "nombre": "Cuenta verificada"}
        main.app.dependency_overrides[auth_service.verified_google_identity] = lambda: identity
        response = self.client.post("/api/auth/verify")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_email_header_does_not_authenticate(self):
        email = "l.aiquipa-castro@alianzafrancesa.org.pe"
        response = self.client.get("/api/usuarios", headers={"X-User-Email": email})
        self.assertEqual(response.status_code, 401)

    def test_google_claims_require_verified_workspace_domain(self):
        credential = HTTPAuthorizationCredentials(scheme="Bearer", credentials="signed-token")
        valid = {
            "sub": "google-subject",
            "email": "persona@alianzafrancesa.org.pe",
            "email_verified": True,
            "hd": "alianzafrancesa.org.pe",
        }
        with patch.object(auth_service.id_token, "verify_oauth2_token", return_value=valid) as verify:
            identity = auth_service.verified_google_identity(credential)
        self.assertEqual(identity["email"], valid["email"])
        self.assertEqual(verify.call_args.kwargs["audience"], auth_service.GOOGLE_CLIENT_ID)

        invalid = {**valid, "hd": "example.com"}
        with patch.object(auth_service.id_token, "verify_oauth2_token", return_value=invalid):
            with self.assertRaises(HTTPException) as rejected:
                auth_service.verified_google_identity(credential)
        self.assertEqual(rejected.exception.status_code, 403)

    def test_protected_administrators_keep_access(self):
        email = "l.aiquipa-castro@alianzafrancesa.org.pe"
        admin = self.authenticate_as(email, "admin-subject")
        self.assertEqual(admin["rol"], "ADMIN_TI")
        session = database.SessionLocal()
        protected = (
            session.query(main.Usuario)
            .filter(main.Usuario.email.in_(main.TI_ADMIN_EMAILS))
            .all()
        )
        self.assertEqual(len(protected), 4)
        self.assertTrue(all(user.rol == "ADMIN_TI" for user in protected))
        self.assertTrue(all(user.estado == "Activo" for user in protected))
        session.close()
        for payload in (
            {"email": "otro@alianzafrancesa.org.pe"},
            {"rol": "Usuario"},
            {"estado": "Suspendido"},
        ):
            response = self.client.put(f"/api/usuarios/{admin['id']}", json=payload)
            self.assertEqual(response.status_code, 409, response.text)

    def test_ticket_notes_closure_dates_and_assignment_are_consistent(self):
        email = "l.aiquipa-castro@alianzafrancesa.org.pe"
        self.authenticate_as(email, "admin-subject")
        main.send_new_ticket_email = lambda **kwargs: True
        main.send_new_ticket_whatsapp = lambda **kwargs: True
        main.send_ticket_resolved_email = lambda **kwargs: True

        created_response = self.client.post(
            "/api/tickets",
            json={
                "solicitante_email": email,
                "tipo_requerimiento": "Prueba de historial",
                "prioridad": "Media",
                "descripcion": "Validar notas acumulativas",
                "sede": "Miraflores",
            },
        )
        self.assertEqual(created_response.status_code, 200, created_response.text)
        ticket = created_response.json()
        ticket_id = ticket["id"]
        self.assertTrue(ticket["fecha_creacion"].endswith("-05:00"))

        for contenido in ("Primera revisión técnica", "Segunda revisión técnica"):
            response = self.client.put(
                f"/api/tickets/{ticket_id}",
                json={"notas_tecnicas": contenido},
            )
            self.assertEqual(response.status_code, 200, response.text)
        ticket = response.json()
        self.assertEqual(
            [nota["contenido"] for nota in ticket["notas"]],
            ["Primera revisión técnica", "Segunda revisión técnica"],
        )

        rejected = self.client.put(
            f"/api/tickets/{ticket_id}",
            json={"estado": "Solucionado"},
        )
        self.assertEqual(rejected.status_code, 400)
        solved = self.client.put(
            f"/api/tickets/{ticket_id}",
            json={
                "estado": "Solucionado",
                "nota_solucion": "Se corrigió la causa y el usuario validó el resultado.",
            },
        )
        self.assertEqual(solved.status_code, 200, solved.text)
        ticket = solved.json()
        self.assertEqual(ticket["estado"], "Solucionado")
        self.assertEqual(len(ticket["notas"]), 3)
        self.assertEqual(ticket["notas"][-1]["tipo"], "solucion")
        self.assertEqual(ticket["notas"][-1]["estado_resultante"], "Solucionado")
        self.assertIsNotNone(ticket["fecha_resolucion"])
        fecha_resolucion = ticket["fecha_resolucion"]
        self.assertGreaterEqual(
            datetime.fromisoformat(ticket["fecha_actualizacion"]),
            datetime.fromisoformat(ticket["fecha_creacion"]),
        )

        close_rejected = self.client.put(
            f"/api/tickets/{ticket_id}",
            json={"estado": "Cerrado"},
        )
        self.assertEqual(close_rejected.status_code, 400)
        closed = self.client.put(
            f"/api/tickets/{ticket_id}",
            json={
                "estado": "Cerrado",
                "nota_solucion": "Se confirmó la conformidad final y se cerró el caso.",
            },
        )
        self.assertEqual(closed.status_code, 200, closed.text)
        self.assertEqual(closed.json()["estado"], "Cerrado")
        self.assertEqual(len(closed.json()["notas"]), 4)
        self.assertEqual(closed.json()["fecha_resolucion"], fecha_resolucion)

        session = database.SessionLocal()
        technician = main.Usuario(
            email="asignable@alianzafrancesa.org.pe",
            nombre="Técnico Asignable",
            rol="HELPDESK_TI",
            estado="Activo",
        )
        session.add(technician)
        session.commit()
        technician_id = technician.id
        session.close()

        assigned = self.client.put(
            f"/api/tickets/{ticket_id}",
            json={"tecnico_asignado_id": technician_id},
        )
        self.assertEqual(assigned.status_code, 200, assigned.text)
        self.assertEqual(assigned.json()["tecnico_asignado_id"], technician_id)
        self.assertEqual(assigned.json()["tecnico_asignado"], "Técnico Asignable")

        unassigned = self.client.put(
            f"/api/tickets/{ticket_id}",
            json={"tecnico_asignado_id": None},
        )
        self.assertEqual(unassigned.status_code, 200, unassigned.text)
        self.assertIsNone(unassigned.json()["tecnico_asignado_id"])
        self.assertIsNone(unassigned.json()["tecnico_asignado"])
        invalid_assignment = self.client.put(
            f"/api/tickets/{ticket_id}",
            json={"tecnico_asignado_id": 999999},
        )
        self.assertEqual(invalid_assignment.status_code, 400)

    def test_non_protected_ti_role_survives_login_and_conflicts_are_errors(self):
        session = database.SessionLocal()
        technician = main.Usuario(
            email="tecnico-prueba@alianzafrancesa.org.pe",
            nombre="Técnico",
            rol="HELPDESK_TI",
            estado="Activo",
        )
        duplicate = main.Usuario(
            email="duplicado-prueba@alianzafrancesa.org.pe",
            nombre="Duplicado",
            rol="Usuario",
            estado="Activo",
        )
        session.add_all([technician, duplicate])
        session.commit()
        technician_id = technician.id
        session.close()

        logged_in = self.authenticate_as(
            "tecnico-prueba@alianzafrancesa.org.pe",
            "technician-subject",
        )
        self.assertEqual(logged_in["rol"], "HELPDESK_TI")

        self.authenticate_as("l.aiquipa-castro@alianzafrancesa.org.pe", "admin-subject")
        conflict = self.client.put(
            f"/api/usuarios/{technician_id}",
            json={"email": "duplicado-prueba@alianzafrancesa.org.pe"},
        )
        self.assertEqual(conflict.status_code, 409)
        invalid = self.client.put(
            f"/api/usuarios/{technician_id}",
            json={"rol": "SUPERADMIN"},
        )
        self.assertEqual(invalid.status_code, 422)
        unauthorized_admin = self.client.put(
            f"/api/usuarios/{technician_id}",
            json={"rol": "ADMIN_TI"},
        )
        self.assertEqual(unauthorized_admin.status_code, 403)


if __name__ == "__main__":
    unittest.main()
