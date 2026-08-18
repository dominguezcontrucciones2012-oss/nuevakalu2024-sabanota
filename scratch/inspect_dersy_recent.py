import sqlite3

conn = sqlite3.connect("backups/respaldo_kalu_2026-05-20_02-58-16.db")
c = conn.cursor()
c.execute("""
    SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
    FROM movimientos_productores
    WHERE proveedor_id = 32
    ORDER BY fecha ASC, id ASC
""")
rows = c.fetchall()
conn.close()

print("=== Dersy Corro Rows 10 to 25 ===")
running = 0.0
for i, r in enumerate(rows[:25]):
    mid, fecha, tipo, debe, haber, db_saldo, desc = r
    debe = float(debe or 0.0)
    running = running + haber - debe
    diff = db_saldo - running
    print(f"{i:2d} | ID: {mid} | Date: {fecha} | Type: {tipo:10s} | D/H: {debe:.2f}/{haber:.2f} | DB Saldo: {db_saldo:.2f} | Calc: {running:.2f} | Diff: {diff:.2f} | {desc[:40]}")
