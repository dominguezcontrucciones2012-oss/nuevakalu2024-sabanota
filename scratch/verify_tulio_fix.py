import sqlite3

db_path = "instance/kalu_master.db"

def verify():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    print("=== RUNNING VERIFICATION FOR TULIO CORRO FIX ===")
    
    # 1. Verify Tulio Corro (ID 4)
    c.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE id = 4")
    prov = c.fetchone()
    print(f"Proveedores Table - ID: {prov[0]} | Nombre: {prov[1]} | Saldo Pendiente: {prov[2]}")
    assert prov[2] == 20.09, f"Error: Balance is {prov[2]}, expected 20.09"
    
    # 2. Verify last movement
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 4
        ORDER BY fecha DESC, id DESC
        LIMIT 1
    """)
    last_mov = c.fetchone()
    print(f"Last Movement - ID: {last_mov[0]} | Tipo: {last_mov[2]} | Debe: {last_mov[3]} | Haber: {last_mov[4]} | Saldo Momento: {last_mov[5]} | Desc: {last_mov[6]}")
    assert abs(last_mov[5] - 20.09) < 0.001, f"Error: Last running balance is {last_mov[5]}, expected 20.09"
    
    # 3. Cross check Alfonzo, Angelito, Andres Eloy
    c.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE id IN (1, 10, 30)")
    others = c.fetchall()
    print("\nCross check other producers:")
    for o in others:
        print(f"  ID: {o[0]} | Nombre: {o[1]} | Saldo: {o[2]}")
        if o[0] == 1:
            assert abs(o[2] - 73.47) < 0.001, f"Error: Alfonzo balance was modified! Current: {o[2]}"
        elif o[0] == 10:
            assert abs(o[2] - (-80.64)) < 0.001, f"Error: Angelito balance was modified! Current: {o[2]}"
        elif o[0] == 30:
            assert abs(o[2] - (-29.04)) < 0.001, f"Error: Andres Eloy balance was modified! Current: {o[2]}"
            
    conn.close()
    print("\n=== VERIFICATION COMPLETED: ALL CHECKS PASSED ===")

if __name__ == "__main__":
    verify()
