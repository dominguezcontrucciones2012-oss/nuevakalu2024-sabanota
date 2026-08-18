import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

c.execute("PRAGMA table_info(productos)")
print("Columns in productos:", [x[1] for x in c.fetchall()])

c.execute("SELECT * FROM productos WHERE nombre LIKE '%QUESO%'")
print("=== QUESO Product ===")
for r in c.fetchall():
    print(r)

conn.close()
