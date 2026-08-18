import sqlite3
from decimal import Decimal

db_path = "instance/kalu_master.db"

def simulate():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    # Get all suppliers with 'andre' in their name
    c.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE nombre LIKE '%andre%'")
    suppliers = c.fetchall()
    
    for prov_id, name, current_saldo in suppliers:
        print(f"\n==========================================")
        print(f"Simulando para: {name} (ID: {prov_id})")
        print(f"Saldo actual en DB: {current_saldo}")
        print(f"==========================================")
        
        # Get all movements
        c.execute("""
            SELECT id, debe, haber, tipo, descripcion, fecha
            FROM movimientos_productores
            WHERE proveedor_id = ?
            ORDER BY fecha ASC, id ASC
        """, (prov_id,))
        rows = c.fetchall()
        
        # Scenario 1: Original running balance
        running_original = 0.0
        for row in rows:
            mid, debe, haber, tipo, desc, date = row
            running_original += float(haber or 0) - float(debe or 0)
            
        print(f"Saldo recalculado original: {running_original:.2f}")
        
        # Scenario 2: Correcting ALL ABONO_POS (moving from debe to haber)
        running_corrected_pos = 0.0
        corrected_items = []
        for row in rows:
            mid, debe, haber, tipo, desc, date = row
            debe_val = float(debe or 0)
            haber_val = float(haber or 0)
            if tipo == 'ABONO_POS' and debe_val > 0:
                # Correct it
                haber_val = debe_val
                debe_val = 0.0
                corrected_items.append((mid, debe_val, haber_val, desc))
            running_corrected_pos += haber_val - debe_val
            
        print(f"Corrigiendo ABONO_POS:")
        for mid, d, h, desc in corrected_items:
            print(f"  - Mov ID {mid}: se cambio a Haber: {h} | {desc[:40]}")
        print(f"Saldo final tras corregir ABONO_POS: {running_corrected_pos:.2f}")
        
        # Scenario 3: What if we only correct specific abonos?
        # User says: "13/04/26 esa dos facturas andre las abonos y las pasates a resta"
        # On 13/04/26, andres eloy has:
        # - ID 515: $160.00
        # - ID 526: $2.00
        # Let's see if we only correct those two
        running_corrected_only_13_04 = 0.0
        for row in rows:
            mid, debe, haber, tipo, desc, date = row
            debe_val = float(debe or 0)
            haber_val = float(haber or 0)
            if mid in [515, 526]:
                haber_val = debe_val
                debe_val = 0.0
            running_corrected_only_13_04 += haber_val - debe_val
        print(f"Saldo final corrigiendo SOLO los 2 abonos del 13/04/26: {running_corrected_only_13_04:.2f}")
        
    conn.close()

if __name__ == "__main__":
    simulate()
