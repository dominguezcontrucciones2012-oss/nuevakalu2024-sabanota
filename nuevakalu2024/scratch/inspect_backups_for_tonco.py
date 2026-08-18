import sqlite3
import os

dbs = [
    "instance/kalu_master.db",
    "backups/respaldo_kalu_2026-05-20_02-58-16.db",
    "backups/respaldo_kalu_2026-05-19_01-11-31.db",
    "backups/respaldo_kalu_2026-05-16_22-39-16.db",
    "backups/respaldo_kalu_2026-05-16_22-33-31.db",
    "backups/respaldo_kalu_2026-05-11_01-31-53.db",
    "backups/respaldo_kalu_2026-05-04_02-53-04.db",
]

for db in dbs:
    if not os.path.exists(db):
        continue
    conn = sqlite3.connect(db)
    c = conn.cursor()
    c.execute("""
        SELECT id, fecha, tipo, kilos, haber, debe, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 5 AND (kilos = 19.8 OR haber = 83.16 OR fecha >= '2026-05-18')
    """)
    rows = c.fetchall()
    conn.close()
    if rows:
        print(f"DB: {db}")
        for r in rows:
            print(f"  {r}")
