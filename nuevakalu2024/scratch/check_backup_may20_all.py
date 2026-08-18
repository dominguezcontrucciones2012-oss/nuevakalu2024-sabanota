import sqlite3

db_path = "backups/respaldo_kalu_2026-05-20_02-58-16.db"
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute("""
    SELECT m.id, m.fecha, m.tipo, m.debe, m.haber, m.saldo_momento, m.descripcion
    FROM movimientos_productores m
    WHERE m.proveedor_id = 30
    ORDER BY m.fecha ASC, m.id ASC
""")
rows = c.fetchall()

with open("scratch/backup_may20_all.txt", "w", encoding="utf-8") as f:
    f.write(f"{'Index':5s} | {'ID':4s} | {'Fecha':23s} | {'Tipo':10s} | {'Debe':8s} | {'Haber':8s} | {'Saldo':10s} | {'Running':10s} | {'Diff':8s} | {'Description'}\n")
    f.write("-" * 140 + "\n")
    running = 0.0
    for i, r in enumerate(rows):
        mid, fecha, tipo, debe, haber, db_saldo, desc = r
        debe_val = float(debe or 0)
        haber_val = float(haber or 0)
        db_saldo_val = float(db_saldo or 0)
        running += haber_val - debe_val
        diff = db_saldo_val - running
        f.write(f"{i:5d} | {mid:4d} | {fecha:23s} | {tipo:10s} | {debe_val:8.2f} | {haber_val:8.2f} | {db_saldo_val:10.2f} | {running:10.2f} | {diff:+8.2f} | {desc[:40]}\n")

conn.close()
