import sqlite3

conn = sqlite3.connect("backups/respaldo_kalu_2026-05-19_01-11-31.db")
c = conn.cursor()
c.execute("""
    SELECT m.id, m.fecha, m.tipo, m.debe, m.haber, m.saldo_momento, m.descripcion
    FROM movimientos_productores m
    WHERE m.proveedor_id = 30
    ORDER BY m.id ASC
""")
print("=== andres eloy (ID 30) Movements BEFORE Fix ===")
for r in c.fetchall():
    print(r)
conn.close()
