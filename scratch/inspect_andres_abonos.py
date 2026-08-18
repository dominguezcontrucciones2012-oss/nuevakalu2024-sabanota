import sqlite3

conn = sqlite3.connect("backups/respaldo_kalu_2026-05-19_01-11-31.db")
c = conn.cursor()
c.execute("""
    SELECT id, fecha, tipo, debe, haber, descripcion
    FROM movimientos_productores
    WHERE proveedor_id = 30 AND (tipo LIKE '%ABONO%' OR descripcion LIKE '%Abono%')
    ORDER BY id ASC
""")
print("=== andres eloy Abonos ===")
for r in c.fetchall():
    print(r)
conn.close()
