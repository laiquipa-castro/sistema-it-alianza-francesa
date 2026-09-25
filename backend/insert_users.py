
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sistema_it.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            solicitante_email TEXT,
            tipo_requerimiento TEXT,
            prioridad TEXT,
            descripcion TEXT,
            estado TEXT DEFAULT 'Pendiente',
            tecnico_asignado TEXT DEFAULT 'Sin Asignar',
            fecha_creacion TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY,
            name TEXT,
            role TEXT,
            cargo_ti TEXT
        )
    """)
    conn.commit()
    conn.close()

def insert_initial_users():
    conn = sqlite3.connect("sistema_it.db")
    cursor = conn.cursor()

    users = [
        ("jesus.barbaran@alianzafrancesa.org.pe", "Jesús Barbarán", "tecnico", "Help Desk"),
        ("adrian.alcantara@alianzafrancesa.org.pe", "Adrián Alcántara", "tecnico", "Gestor de Infraestructura TI"),
        ("jhon.salas@alianzafrancesa.org.pe", "Jhon Salas", "tecnico", "Arquitecto de Soluciones TI"),
        ("luis.aiquipa@alianzafrancesa.org.pe", "Luis Aiquipa - Castro Roberts", "admin", "Responsable de Sistemas - Admin General")
    ]

    for email, name, role, cargo_ti in users:
        cursor.execute("INSERT OR IGNORE INTO users (email, name, role, cargo_ti) VALUES (?, ?, ?, ?)", (email, name, role, cargo_ti))
    
    conn.commit()
    conn.close()
    print("Initial users inserted successfully.")

if __name__ == "__main__":
    init_db() # Ensure tables are created
    insert_initial_users()
