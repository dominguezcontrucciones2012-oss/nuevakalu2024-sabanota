import sqlite3

for db_path in ["backups/respaldo_kalu_2026-05-19_01-11-31.db", "instance/kalu_master.db"]:
    print(f"=== DB: {db_path} ===")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("""
        SELECT id, proveedor_id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE id BETWEEN 905 AND 930
        ORDER BY id ASC
    """)
    for r in c.fetchall():
        print(f"  ID: {r[0]} | Prov: {r[1]} | Tipo: {r[3]:12s} | Debe/Haber: {r[4]:.2f}/{r[5]:.2f} | Saldo: {r[6]:.2f} | {r[7][:40]}")
    conn.close()
