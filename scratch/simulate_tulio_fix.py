import sqlite3

db_path = "instance/kalu_master.db"

def simulate():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    print("=== SIMULATING TULIO CORRO FIX ===")
    
    # 1. Get current balance from proveedores
    c.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE id = 4")
    prov = c.fetchone()
    print(f"Current Proveedores Table: ID: {prov[0]} | Nombre: {prov[1]} | Saldo: {prov[2]}")
    
    # 2. Get all movements
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 4
        ORDER BY fecha ASC, id ASC
    """)
    movs = c.fetchall()
    
    print(f"Total movements: {len(movs)}")
    
    running = 0.0
    wrong_abonos_ids = [113, 147, 280, 553]
    
    print("\nChronological simulation:")
    for m in movs:
        mid, fecha, tipo, debe, haber, _, desc = m
        debe_val = float(debe or 0.0)
        haber_val = float(haber or 0.0)
        
        # Apply fix simulation
        if mid in wrong_abonos_ids:
            # Move from debe to haber
            new_debe = 0.0
            new_haber = debe_val
            print(f"  [FIXED] ID: {mid} | Tipo: {tipo} | Moved {debe_val} from Debe to Haber")
        else:
            new_debe = debe_val
            new_haber = haber_val
            
        running = running + new_haber - new_debe
        print(f"    ID: {mid:4d} | Fecha: {fecha} | {tipo:12s} | Debe: {new_debe:6.2f} | Haber: {new_haber:6.2f} | New Running Saldo: {running:+7.2f}")
        
    print(f"\nFinal Simulated Balance: {running:.6f}")
    conn.close()

if __name__ == "__main__":
    simulate()
