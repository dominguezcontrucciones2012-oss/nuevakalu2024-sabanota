import sqlite3
from decimal import Decimal

db_path = "instance/kalu_master.db"

def run_fix():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    print("=== STARTING BALANCE CORRECTION FOR ANDRES ELOY (ID 30) - OPTION B ===")
    
    # 1. Correct the two 13/04/2026 transactions
    c.execute("""
        UPDATE movimientos_productores
        SET debe = 0.00, haber = 160.00, descripcion = '[CORREGIDO SIGNOS] ' || descripcion
        WHERE id = 515
    """)
    print("Corrected transaction ID 515: changed debe to 0.00 and haber to 160.00")
    
    c.execute("""
        UPDATE movimientos_productores
        SET debe = 0.00, haber = 2.00, descripcion = '[CORREGIDO SIGNOS] ' || descripcion
        WHERE id = 526
    """)
    print("Corrected transaction ID 526: changed debe to 0.00 and haber to 2.00")
    
    # 2. Insert adjustment transaction
    c.execute("""
        INSERT INTO movimientos_productores (
            proveedor_id, tipo, descripcion, kilos, monto_usd, debe, haber, saldo_momento, anio, semana_del_anio, fecha
        ) VALUES (
            30, 'AJUSTE', 'Ajuste de conciliacion de saldo historico', 0.00, 0.00, 32.46, 0.00, 0.00, 2026, 16, '2026-04-13 18:12:00.000000'
        )
    """)
    print("Inserted adjustment transaction of -32.46 USD (debe = 32.46) on 2026-04-13")
    
    # 3. Recalculate balances
    c.execute("""
        SELECT id, debe, haber, tipo, descripcion, fecha
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY fecha ASC, id ASC
    """)
    rows = c.fetchall()
    
    print(f"Recalculating {len(rows)} transactions...")
    running = 0.0
    for idx, row in enumerate(rows):
        mid, debe, haber, tipo, desc, date = row
        debe = float(debe or 0.0)
        haber = float(haber or 0.0)
        running = running + haber - debe
        c.execute("UPDATE movimientos_productores SET saldo_momento = ? WHERE id = ?", (running, mid))
        
    print(f"New running balance: {running:.4f}")
    
    # 4. Update the proveedores table
    rounded_final = round(running, 2)
    c.execute("UPDATE proveedores SET saldo_pendiente_usd = ? WHERE id = 30", (rounded_final,))
    print(f"Updated proveedores table with final balance: {rounded_final:.2f} USD")
    
    conn.commit()
    conn.close()
    print("=== BALANCE CORRECTION COMPLETED SUCCESSFULLY ===")

if __name__ == '__main__':
    run_fix()
