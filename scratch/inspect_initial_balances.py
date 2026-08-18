import sqlite3

db_path = "backups/respaldo_kalu_2026-05-20_02-58-16.db"
conn = sqlite3.connect(db_path)
c = conn.cursor()

# Get all producers and their min movement ID
c.execute("""
    SELECT p.id, p.nombre, p.saldo_pendiente_usd, MIN(m.id), MIN(m.fecha)
    FROM proveedores p
    LEFT JOIN movimientos_productores m ON m.proveedor_id = p.id
    WHERE p.es_productor=1 OR p.es_obrero=1
    GROUP BY p.id
""")
producers = c.fetchall()

print(f"{'Productor':25s} | {'ID':3s} | {'Saldo':8s} | {'Min ID':6s} | {'Min Date':19s}")
print("-" * 75)
for p in producers:
    print(f"{p[1]:25s} | {p[0]:3d} | {p[2]:8.2f} | {str(p[3]):6s} | {str(p[4]):19s}")

conn.close()
