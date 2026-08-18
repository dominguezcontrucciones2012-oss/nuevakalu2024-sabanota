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
print("=== Finding where the discrepancy starts ===")
running = 0.0
first_diff_idx = None
for i, r in enumerate(rows):
    mid, fecha, tipo, debe, haber, db_saldo, desc = r
    debe = float(debe or 0)
    running = running + float(haber or 0) - debe
    diff = db_saldo - running
    
    # Print the first 10 rows and any row around the first discrepancy
    if abs(diff) > 0.01 and first_diff_idx is None:
        first_diff_idx = i
        print("FIRST DISCREPANCY DETECTED HERE:")
        
    if first_diff_idx is None or (i >= first_diff_idx - 5 and i <= first_diff_idx + 5) or i < 5:
        print(f"{i:2d} | ID: {mid} | Date: {fecha} | Type: {tipo:10s} | D/H: {debe:.2f}/{float(haber or 0):.2f} | DB Saldo: {db_saldo:.2f} | Calc: {running:.2f} | Diff: {diff:.2f} | {desc[:40]}")
conn.close()
