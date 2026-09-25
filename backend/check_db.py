import sqlite3

conn = sqlite3.connect('sistema_it.db')
cursor = conn.cursor()

# Get table schemas
cursor.execute('SELECT sql FROM sqlite_master WHERE type="table"')
tables = cursor.fetchall()
print("=== TABLES ===")
for t in tables:
    print(t[0])

# Get users
cursor.execute('SELECT * FROM users')
users = cursor.fetchall()
print("\n=== USERS ===")
for u in users:
    print(u)

# Get tickets
cursor.execute('SELECT * FROM tickets')
tickets = cursor.fetchall()
print("\n=== TICKETS ===")
for t in tickets:
    print(t)

conn.close()