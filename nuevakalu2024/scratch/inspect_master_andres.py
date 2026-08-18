import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("""
    SELECT m.id, m.fecha, m.tipo, m.debe, m.haber, m.saldo_momento, m.descripcion
    FROM movimientos_productores m
    WHERE m.proveedor_id = 30
    ORDER BY m.fecha ASC, m.id ASC
""")
rows = c.fetchall()
print("=== andres eloy (ID 30) - Master DB First 30 rows ===")
running = 0.0
for i, r in enumerate(rows[:30]):
    mid, fecha, tipo, debe, haber, db_saldo, desc = r
    debe = float(debe or 0)
    running = running + float(haber or 0) - debe
    diff = db_saldo - running
    print(f"{i:2d} | ID: {mid} | Date: {fecha} | Type: {tipo:10s} | D/H: {debe:.2f}/{float(haber or 0):.2f} | DB Saldo: {db_saldo:.2f} | Calc: {running:.2f} | Diff: {diff:.2f} | {desc[:40]}")
conn.close()
