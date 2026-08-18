import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("SELECT * FROM movimientos_productores WHERE id = 1274")
print("Row 1274 in movimientos_productores:", c.fetchone())

c.execute("SELECT * FROM proveedores WHERE id = 19")
print("Row 19 in proveedores:", c.fetchone())

c.execute("SELECT id, nombre FROM proveedores WHERE id IN (3, 19, 30)")
print("Providers 3, 19, 30:", c.fetchall())

conn.close()
