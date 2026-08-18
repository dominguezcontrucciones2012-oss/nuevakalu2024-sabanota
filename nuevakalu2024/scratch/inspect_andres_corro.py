import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("""
    SELECT m.id, m.fecha, m.tipo, m.descripcion, m.kilos, m.debe, m.haber, m.saldo_momento
    FROM movimientos_productores m
    WHERE m.proveedor_id = 19
    ORDER BY m.id DESC
""")
print("=== ANDRES CORRO (ID 19) Movements ===")
for r in c.fetchall():
    print(f"ID: {r[0]} | Fecha: {r[1]} | Tipo: {r[2]} | Desc: {r[3]} | Kilos: {r[4]} | Debe: {r[5]} | Haber: {r[6]} | Saldo: {r[7]}")

print("\n=== andres eloy (ID 30) Movements ===")
c.execute("""
    SELECT m.id, m.fecha, m.tipo, m.descripcion, m.kilos, m.debe, m.haber, m.saldo_momento
    FROM movimientos_productores m
    WHERE m.proveedor_id = 30
    ORDER BY m.id DESC
""")
for r in c.fetchall():
    print(f"ID: {r[0]} | Fecha: {r[1]} | Tipo: {r[2]} | Desc: {r[3]} | Kilos: {r[4]} | Debe: {r[5]} | Haber: {r[6]} | Saldo: {r[7]}")
    
conn.close()
