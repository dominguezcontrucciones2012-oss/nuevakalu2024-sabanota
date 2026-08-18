import sqlite3
from datetime import datetime

db_path = "instance/kalu_master.db"

def apply_fix():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    print("=== APPLYING TULIO CORRO (ID 4) BALANCE CORRECTION ===")
    
    wrong_abonos_ids = [113, 147, 280, 553]
    
    # 1. Correct the sign errors in movimientos_productores
    for mid in wrong_abonos_ids:
        # Get current values first
        c.execute("SELECT debe, descripcion FROM movimientos_productores WHERE id = ?", (mid,))
        row = c.fetchone()
        if not row:
            print(f"Error: Transaction ID {mid} not found!")
            continue
        debe_val = float(row[0] or 0.0)
        desc = row[1]
        
        if debe_val > 0.0:
            new_desc = f"[CORREGIDO SIGNOS] {desc}"
            c.execute("""
                UPDATE movimientos_productores
                SET debe = 0.00, haber = ?, descripcion = ?
                WHERE id = ?
            """, (debe_val, new_desc, mid))
            print(f"Corrected ID {mid}: moved {debe_val} from Debe to Haber.")
        else:
            print(f"ID {mid} already corrected or has debe=0.00 (debe: {debe_val}).")
            
    # 2. Recalculate running balance for Tulio Corro
    c.execute("""
        SELECT id, debe, haber, tipo, descripcion, fecha
        FROM movimientos_productores
        WHERE proveedor_id = 4
        ORDER BY fecha ASC, id ASC
    """)
    rows = c.fetchall()
    print(f"\nRecalculating balances for Tulio Corro ({len(rows)} movements):")
    running = 0.0
    for idx, row in enumerate(rows):
        mid, debe, haber, tipo, desc, date = row
        debe = float(debe or 0.0)
        haber = float(haber or 0.0)
        running = running + haber - debe
        c.execute("UPDATE movimientos_productores SET saldo_momento = ? WHERE id = ?", (running, mid))
        
    rounded_final = round(running, 2)
    c.execute("UPDATE proveedores SET saldo_pendiente_usd = ? WHERE id = 4", (rounded_final,))
    print(f"\nUpdated supplier Tulio Corro (ID 4) saldo_pendiente_usd to {rounded_final:+.2f}")
    
    conn.commit()
    conn.close()
    print("=== TULIO CORRO BALANCE CORRECTION COMMITTED ===")

if __name__ == "__main__":
    apply_fix()
