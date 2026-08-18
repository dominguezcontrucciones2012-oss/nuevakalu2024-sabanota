import sqlite3

conn = sqlite3.connect("backups/respaldo_kalu_2026-05-19_01-11-31.db")
c = conn.cursor()

# Get column names for asientos
c.execute("PRAGMA table_info(asientos)")
print("Asientos columns:", [col[1] for col in c.fetchall()])

print("\n=== Movimientos around April 10, 2026 ===")
c.execute("""
    SELECT id, proveedor_id, fecha, tipo, debe, haber, descripcion
    FROM movimientos_productores
    WHERE fecha LIKE '2026-04-10%' OR fecha LIKE '2026-04-11%'
""")
for r in c.fetchall():
    print(r)
conn.close()
