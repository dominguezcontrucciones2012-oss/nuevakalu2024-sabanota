import sqlite3
import shutil
from decimal import Decimal

# Make a temporary copy of the master db to simulate
shutil.copyfile("instance/kalu_master.db", "scratch/kalu_master_sim.db")

db_path = "scratch/kalu_master_sim.db"

def simulate_option_b():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    # 1. Correct the two 13/04/2026 transactions
    c.execute("""
        UPDATE movimientos_productores
        SET debe = 0.00, haber = 160.00, descripcion = '[CORREGIDO SIGNOS] ' || descripcion
        WHERE id = 515
    """)
    c.execute("""
        UPDATE movimientos_productores
        SET debe = 0.00, haber = 2.00, descripcion = '[CORREGIDO SIGNOS] ' || descripcion
        WHERE id = 526
    """)
    
    # 2. Insert adjustment transaction
    # We place it right after ID 526 (April 13, 2026)
    c.execute("""
        INSERT INTO movimientos_productores (
            proveedor_id, tipo, descripcion, kilos, monto_usd, debe, haber, saldo_momento, anio, semana_del_anio, fecha
        ) VALUES (
            30, 'AJUSTE', 'Ajuste de conciliacion de saldo historico', 0.00, 0.00, 32.46, 0.00, 0.00, 2026, 16, '2026-04-13 18:12:00.000000'
        )
    """)
    
    # 3. Recalculate balances
    c.execute("""
        SELECT id, debe, haber, tipo, descripcion, fecha
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY fecha ASC, id ASC
    """)
    rows = c.fetchall()
    
    print("Recalculating...")
    running = 0.0
    for idx, row in enumerate(rows):
        mid, debe, haber, tipo, desc, date = row
        debe = float(debe or 0.0)
        haber = float(haber or 0.0)
        running = running + haber - debe
        c.execute("UPDATE movimientos_productores SET saldo_momento = ? WHERE id = ?", (running, mid))
        
    conn.commit()
    print(f"Final simulated running balance: {running:.4f}")
    
    # Check what is in the table now
    c.execute("SELECT saldo_momento FROM movimientos_productores WHERE proveedor_id = 30 ORDER BY fecha DESC, id DESC LIMIT 1")
    last_saldo = c.fetchone()[0]
    print(f"Database last saldo_momento: {last_saldo}")
    
    conn.close()

if __name__ == '__main__':
    simulate_option_b()
