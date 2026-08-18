import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

# Get table schema
c.execute("PRAGMA table_info(proveedores)")
print("=== Proveedores Schema ===")
for r in c.fetchall():
    print(r)

# Get specific suppliers
c.execute("SELECT * FROM proveedores WHERE id IN (19, 30)")
print("\n=== Providers 19 and 30 ===")
for r in c.fetchall():
    print(r)

conn.close()
