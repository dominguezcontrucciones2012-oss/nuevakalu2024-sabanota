import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("""
    SELECT id, fecha, tipo, debe, haber, descripcion
    FROM movimientos_productores
    WHERE proveedor_id = 32 AND tipo = 'ABONO_POS'
""")
print(c.fetchall())
conn.close()
