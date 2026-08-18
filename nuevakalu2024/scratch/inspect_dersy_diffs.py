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

print("=== Dersy Corro Diff Jumps ===")
running = 0.0
prev_diff = 0.0
for i, r in enumerate(rows):
    mid, fecha, tipo, debe, haber, db_saldo, desc = r
    debe = float(debe or 0.0)
    running = running + haber - debe
    diff = db_saldo - running
    change = diff - prev_diff
    if abs(change) > 0.01:
        print(f"Row {i:3d} | ID: {mid:4d} | Date: {fecha} | Type: {tipo:10s} | Debe/Haber: {debe:.2f}/{haber:.2f} | DB Saldo: {db_saldo:.2f} | Calc: {running:.2f} | Diff: {diff:.2f} | Change: {change:+.2f} | {desc[:40]}")
    prev_diff = diff
