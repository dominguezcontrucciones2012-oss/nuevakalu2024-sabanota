import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("""
    SELECT m.id, m.proveedor_id, p.nombre, m.fecha, m.tipo, m.descripcion, m.kilos, m.debe, m.haber, m.saldo_momento
    FROM movimientos_productores m
    JOIN proveedores p ON m.proveedor_id = p.id
    WHERE m.fecha >= '2026-05-18'
    ORDER BY m.id DESC
""")
print("=== MOVEMENTS IN SQLITE DIRECT (since May 18) ===")
for r in c.fetchall():
    print(f"ID: {r[0]} | ProvID: {r[1]} ({r[2]}) | Fecha: {r[3]} | Tipo: {r[4]} | Desc: {r[5]} | Kilos: {r[6]} | Debe: {r[7]} | Haber: {r[8]} | Saldo: {r[9]}")
conn.close()
