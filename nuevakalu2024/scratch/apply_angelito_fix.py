import sqlite3
from datetime import datetime

db_path = "instance/kalu_master.db"

def run_fix():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    print("=== STARTING BALANCE CORRECTION FOR ANGELITO (ID 10) ===")
    
    # 1. Insert adjustment transaction
    dt = datetime.strptime('2026-05-18 12:16:00', '%Y-%m-%d %H:%M:%S')
    year = dt.year
    week = dt.isocalendar().week
    
    # We use high-precision float 113.83833333333335 to clean up the fractional cents
    ajuste_haber = 113.83833333333335
    
    c.execute("""
        INSERT INTO movimientos_productores (
            proveedor_id, tipo, descripcion, kilos, monto_usd, debe, haber, saldo_momento, anio, semana_del_anio, fecha
        ) VALUES (
            10, 'AJUSTE', 'Ajuste de conciliacion de saldo historico', 0.00, 0.00, 0.00, ?, 0.00, ?, ?, '2026-05-18 12:16:00.000000'
        )
    """, (ajuste_haber, year, week))
    print(f"Inserted adjustment transaction of +{ajuste_haber:.6f} USD (haber = {ajuste_haber:.6f}) on 2026-05-18 (Week {week}, Year {year})")
    
    # 2. Recalculate balances
    c.execute("""
        SELECT id, debe, haber, tipo, descripcion, fecha
        FROM movimientos_productores
        WHERE proveedor_id = 10
        ORDER BY fecha ASC, id ASC
    """)
    rows = c.fetchall()
    
    print(f"Recalculating {len(rows)} transactions for Angelito...")
    running = 0.0
    for idx, row in enumerate(rows):
        mid, debe, haber, tipo, desc, date = row
        debe = float(debe or 0.0)
        haber = float(haber or 0.0)
        running = running + haber - debe
        c.execute("UPDATE movimientos_productores SET saldo_momento = ? WHERE id = ?", (running, mid))
        
    print(f"New running balance: {running:.4f}")
    
    # 3. Update the proveedores table
    rounded_final = round(running, 2)
    c.execute("UPDATE proveedores SET saldo_pendiente_usd = ? WHERE id = 10", (rounded_final,))
    print(f"Updated proveedores table with final balance: {rounded_final:.2f} USD")
    
    conn.commit()
    conn.close()
    print("=== BALANCE CORRECTION COMPLETED SUCCESSFULLY ===")

if __name__ == '__main__':
    run_fix()
