import sqlite3

conn = sqlite3.connect("instance/kalu_master_sim_test.db")
c = conn.cursor()

c.execute("SELECT id, debe, haber, saldo_momento, descripcion FROM movimientos_productores WHERE proveedor_id = 4")
movs = c.fetchall()
print("Tulio Corro movements:")
for m in movs:
    print(m)

c.execute("SELECT nombre, saldo_pendiente_usd FROM proveedores WHERE id = 4")
print("Tulio Corro proveedor record:")
print(c.fetchone())

conn.close()
