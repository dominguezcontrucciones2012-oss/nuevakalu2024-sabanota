import sqlite3

conn = sqlite3.connect("backups/respaldo_kalu_2026-05-19_01-11-31.db")
c = conn.cursor()
c.execute("""
    SELECT m.id, m.fecha, m.tipo, m.debe, m.haber, m.saldo_momento, m.descripcion
    FROM movimientos_productores m
    WHERE m.proveedor_id = 30
    ORDER BY m.fecha ASC, m.id ASC
""")
rows = c.fetchall()
print("=== andres eloy (ID 30) - Step-by-Step Balance Verification ===")
running = 0.0
for r in rows:
    mid, fecha, tipo, debe, haber, db_saldo, desc = r
    debe = float(debe or 0)
    haber = float(haber or 0)
    running = running + haber - debe
    diff = db_saldo - running
    print(f"ID: {mid} | Date: {fecha} | Type: {tipo} | Debe: {debe:.2f} | Haber: {haber:.2f} | DB Saldo: {db_saldo:.2f} | Calc: {running:.2f} | Diff: {diff:.2f}")
conn.close()
