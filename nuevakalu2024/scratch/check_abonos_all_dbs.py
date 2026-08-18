import sqlite3
import os

dbs = [
    "instance/kalu_master.db",
    "backups/respaldo_kalu_2026-05-20_02-58-16.db",
    "backups/respaldo_kalu_2026-05-19_01-11-31.db",
]

for db in dbs:
    if not os.path.exists(db):
        continue
    conn = sqlite3.connect(db)
    c = conn.cursor()
    c.execute("""
        SELECT COUNT(*), 
               SUM(CASE WHEN debe > 0 AND haber = 0 THEN 1 ELSE 0 END) as in_debe,
               SUM(CASE WHEN haber > 0 AND debe = 0 THEN 1 ELSE 0 END) as in_haber
        FROM movimientos_productores
        WHERE tipo = 'ABONO_POS'
    """)
    res = c.fetchone()
    print(f"DB: {db:50s} | Total ABONO_POS: {res[0]} | In Debe: {res[1]} | In Haber: {res[2]}")
    conn.close()
