from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import sqlite3
import os
from datetime import datetime

app = FastAPI(title="Sistema IT Alianza")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sistema_it.db")


def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()
    # Tabla tickets
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            solicitante_email TEXT NOT NULL,
            sede TEXT,
            categoria TEXT,
            prioridad TEXT,
            descripcion TEXT,
            estado TEXT DEFAULT 'Abierto',
            tecnico_asignado TEXT,
            fecha_creacion TEXT DEFAULT (datetime('now','localtime'))
        )
        """
    )
    # Tabla users
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY,
            nombre TEXT,
            rol TEXT,
            cargo_ti TEXT
        )
        """
    )
    conn.commit()
    conn.close()


@app.on_event("startup")
def startup():
    init_db()


class TicketIn(BaseModel):
    solicitante_email: str
    sede: Optional[str] = None
    categoria: Optional[str] = None
    prioridad: Optional[str] = None
    descripcion: Optional[str] = None
    estado: Optional[str] = "Abierto"
    tecnico_asignado: Optional[str] = None


class TicketOut(BaseModel):
    id: int
    solicitante_email: str
    sede: Optional[str] = None
    categoria: Optional[str] = None
    prioridad: Optional[str] = None
    descripcion: Optional[str] = None
    estado: Optional[str] = None
    tecnico_asignado: Optional[str] = None
    fecha_creacion: Optional[str] = None


@app.get("/api/tickets", response_model=List[TicketOut])
def list_tickets():
    conn = get_db()
    rows = conn.execute(
        """
        SELECT id, solicitante_email, sede, categoria, prioridad,
               descripcion, estado, tecnico_asignado, fecha_creacion
        FROM tickets
        ORDER BY id DESC
        """
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/tickets", response_model=TicketOut)
def create_ticket(ticket: TicketIn):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO tickets
            (solicitante_email, sede, categoria, prioridad, descripcion,
             estado, tecnico_asignado, fecha_creacion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            ticket.solicitante_email,
            ticket.sede,
            ticket.categoria,
            ticket.prioridad,
            ticket.descripcion,
            ticket.estado,
            ticket.tecnico_asignado,
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        ),
    )
    conn.commit()
    ticket_id = cur.lastrowid
    row = conn.execute(
        """
        SELECT id, solicitante_email, sede, categoria, prioridad,
               descripcion, estado, tecnico_asignado, fecha_creacion
        FROM tickets WHERE id = ?
        """,
        (ticket_id,),
    ).fetchone()
    conn.close()
    if row is None:
        raise HTTPException(status_code=500, detail="No se pudo crear el ticket")
    return dict(row)


@app.get("/api/users")
def list_users():
    conn = get_db()
    rows = conn.execute("SELECT email, nombre, rol, cargo_ti FROM users").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/")
def root():
    return {"message": "Sistema IT Alianza API", "status": "ok"}