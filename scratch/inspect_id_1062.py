import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("SELECT id, proveedor_id, tipo, debe, haber, descripcion FROM movimientos_productores WHERE id = 1062")
print(c.fetchone())
conn.close()
