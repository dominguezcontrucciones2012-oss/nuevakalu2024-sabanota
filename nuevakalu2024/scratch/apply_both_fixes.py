import sqlite3
from datetime import datetime

db_path = "instance/kalu_master.db"

def apply_alfonzo(c):
    print("--- Applying Alfonzo (ID 1) Fix ---")
    dt = datetime.strptime('2026-05-21 11:15:00', '%Y-%m-%d %H:%M:%S')
    year = dt.year
    week = dt.isocalendar().week
    
    # Check if Alfonzo adjustment already exists to avoid duplicates
    c.execute("SELECT id FROM movimientos_productores WHERE proveedor_id = 1 AND tipo = 'AJUSTE' AND fecha LIKE '2026-05-21%'")
    if c.fetchone():
        print("Alfonzo adjustment already exists. Skipping insertion.")
    else:
        c.execute("""
            INSERT INTO movimientos_productores (
                proveedor_id, tipo, descripcion, kilos, monto_usd, debe, haber, saldo_momento, anio, semana_del_anio, fecha
            ) VALUES (
                1, 'AJUSTE', 'Ajuste de conciliacion de saldo historico', 0.00, 0.00, 0.00, 17.46, 0.00, ?, ?, '2026-05-21 11:15:00.000000'
            )
        """, (year, week))
        print("Inserted Alfonzo adjustment of +17.46 USD (haber = 17.46)")

    # Recalculate Alfonzo's running balance
    c.execute("""
        SELECT id, debe, haber
        FROM movimientos_productores
        WHERE proveedor_id = 1
        ORDER BY fecha ASC, id ASC
    """)
    rows = c.fetchall()
    running = 0.0
    for row in rows:
        mid, debe, haber = row
        running = running + float(haber or 0.0) - float(debe or 0.0)
        c.execute("UPDATE movimientos_productores SET saldo_momento = ? WHERE id = ?", (running, mid))
    
    rounded_final = round(running, 2)
    c.execute("UPDATE proveedores SET saldo_pendiente_usd = ? WHERE id = 1", (rounded_final,))
    print(f"Alfonzo final balance recalculated: {running:.4f} USD. Updated proveedores table to: {rounded_final:.2f} USD")

def apply_angelito(c):
    print("--- Applying Angelito (ID 10) Fix ---")
    dt = datetime.strptime('2026-05-18 12:16:00', '%Y-%m-%d %H:%M:%S')
    year = dt.year
    week = dt.isocalendar().week
    
    # Calculate exact adjustment needed (target - current balance before adjustment)
    # First, let's see current balance without any May 18 adjustment
    c.execute("""
        SELECT id, debe, haber, saldo_momento
        FROM movimientos_productores
        WHERE proveedor_id = 10 AND NOT (tipo = 'AJUSTE' AND fecha LIKE '2026-05-18%')
        ORDER BY fecha ASC, id ASC
    """)
    rows = c.fetchall()
    
    # Calculate running balance of all non-adjustment transactions to find discrepancy
    running = 0.0
    for row in rows:
        _, debe, haber, _ = row
        running = running + float(haber or 0.0) - float(debe or 0.0)
        
    target_final_balance = -80.64
    ajuste_haber = target_final_balance - running
    print(f"Current calculated balance (without adjustment): {running:.6f}")
    print(f"Target balance: {target_final_balance:.6f}")
    print(f"Calculated adjustment needed in Haber: {ajuste_haber:.6f}")
    
    # Check if Angelito adjustment already exists
    c.execute("SELECT id FROM movimientos_productores WHERE proveedor_id = 10 AND tipo = 'AJUSTE' AND fecha LIKE '2026-05-18%'")
    existing = c.fetchone()
    if existing:
        c.execute("""
            UPDATE movimientos_productores
            SET haber = ?
            WHERE id = ?
        """, (ajuste_haber, existing[0]))
        print(f"Updated existing Angelito adjustment ID {existing[0]} to +{ajuste_haber:.6f} USD")
    else:
        c.execute("""
            INSERT INTO movimientos_productores (
                proveedor_id, tipo, descripcion, kilos, monto_usd, debe, haber, saldo_momento, anio, semana_del_anio, fecha
            ) VALUES (
                10, 'AJUSTE', 'Ajuste de conciliacion de saldo historico', 0.00, 0.00, 0.00, ?, ?, ?, '2026-05-18 12:16:00.000000'
            )
        """, (ajuste_haber, year, week))
        print(f"Inserted new Angelito adjustment of +{ajuste_haber:.6f} USD")
        
    # Recalculate Angelito's running balance with the adjustment included
    c.execute("""
        SELECT id, debe, haber
        FROM movimientos_productores
        WHERE proveedor_id = 10
        ORDER BY fecha ASC, id ASC
    """)
    rows = c.fetchall()
    running = 0.0
    for row in rows:
        mid, debe, haber = row
        running = running + float(haber or 0.0) - float(debe or 0.0)
        c.execute("UPDATE movimientos_productores SET saldo_momento = ? WHERE id = ?", (running, mid))
        
    rounded_final = round(running, 2)
    c.execute("UPDATE proveedores SET saldo_pendiente_usd = ? WHERE id = 10", (rounded_final,))
    print(f"Angelito final balance recalculated: {running:.4f} USD. Updated proveedores table to: {rounded_final:.2f} USD")

def main():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    print("=== APPLYING BOTH BALANCE FIXES (ALFONZO & ANGELITO) ===")
    apply_alfonzo(c)
    apply_angelito(c)
    
    conn.commit()
    conn.close()
    print("=== BOTH BALANCE FIXES APPLIED AND COMMITTED ===")

if __name__ == '__main__':
    main()
