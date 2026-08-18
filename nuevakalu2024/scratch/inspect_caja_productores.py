import sqlite3

db_path = "backups/respaldo_kalu_2026-05-20_02-58-16.db"

target_names = ["LUIS CORR0", "andres eloy", "DIANA APONTE", "DERSY CORRO", "Gordo miranda"]

for p_name_target in target_names:
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE nombre LIKE ?", (f"%{p_name_target}%",))
    res = c.fetchone()
    if not res:
        print(f"Could not find {p_name_target}")
        conn.close()
        continue
    p_id, p_name, p_saldo = res
    
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = ?
        ORDER BY fecha ASC, id ASC
    """, (p_id,))
    rows = c.fetchall()
    conn.close()
    
    print(f"=== {p_name} (ID {p_id}) - Backup DB Audit ===")
    running = 0.0
    for i, r in enumerate(rows):
        mid, fecha, tipo, debe, haber, db_saldo, desc = r
        debe = float(debe or 0.0)
        haber = float(haber or 0.0)
        running = running + haber - debe
        diff = db_saldo - running
        # Only print rows where diff changes or if it's an ABONO_POS, or print all if short
        if abs(diff) > 0.01 or tipo == 'ABONO_POS':
            print(f"  {i:2d} | ID: {mid} | Type: {tipo:10s} | D/H: {debe:.2f}/{haber:.2f} | DB Saldo: {db_saldo:.2f} | Calc: {running:.2f} | Diff: {diff:.2f} | {desc[:30]}")
    print(f"  Final Stored Saldo: {p_saldo} | Calculated Running: {running:.2f}")
    print("-" * 80)
