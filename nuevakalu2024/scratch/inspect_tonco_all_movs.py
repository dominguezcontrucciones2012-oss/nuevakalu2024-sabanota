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
        SELECT m.id, m.fecha, m.tipo, m.kilos, m.haber, m.debe, m.saldo_momento, m.descripcion
        FROM movimientos_productores m
        WHERE m.proveedor_id = 5 AND m.fecha >= '2026-05-01 00:00:00'
        ORDER BY m.fecha DESC, m.id DESC
    """)
    rows = c.fetchall()
    print(f"=== DB: {db} | Tonco Martinez (ID 5) - Movements since May 1 ({len(rows)}) ===")
    for r in rows:
        print(f"  ID: {r[0]} | Date: {r[1]} | Type: {r[2]:10s} | Kilos: {r[3]} | H/D: {r[4]}/{r[5]} | Saldo: {r[6]} | Desc: {r[7][:50]}")
    conn.close()
    print("-" * 80)
