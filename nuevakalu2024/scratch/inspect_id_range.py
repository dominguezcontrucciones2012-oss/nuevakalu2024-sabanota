import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("""
    SELECT m.id, m.proveedor_id, p.nombre, m.fecha, m.tipo, m.debe, m.haber, m.descripcion
    FROM movimientos_productores m
    LEFT JOIN proveedores p ON m.proveedor_id = p.id
    WHERE m.id >= 380 AND m.id <= 400
    ORDER BY m.id ASC
""")
rows = c.fetchall()
conn.close()

for r in rows:
    print(f"ID: {r[0]} | Prov: {r[2]} (ID {r[1]}) | Date: {r[3]} | Type: {r[4]} | Debe: {r[5]} | Haber: {r[6]} | Desc: {r[7][:40]}")
