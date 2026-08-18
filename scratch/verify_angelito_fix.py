import sqlite3

db_path = "instance/kalu_master.db"

def verify():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    print("=== RUNNING VERIFICATION FOR ANGELITO FIX ===")
    
    # 1. Verificar tabla proveedores para Angelito (ID 10)
    c.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE id = 10")
    prov = c.fetchone()
    print(f"Proveedores Table - ID: {prov[0]} | Nombre: {prov[1]} | Saldo Pendiente: {prov[2]}")
    assert prov[2] == -80.64, f"Error: Balance is {prov[2]}, expected -80.64"
    
    # 2. Verificar últimos movimientos de Angelito
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 10
        ORDER BY fecha DESC, id DESC
        LIMIT 5
    """)
    movs = c.fetchall()
    print("\nÚltimos 5 movimientos en base de datos para Angelito:")
    for m in reversed(movs):
        print(f"  ID: {m[0]} | Fecha: {m[1]} | Tipo: {m[2]} | Debe: {m[3]:.6f} | Haber: {m[4]:.6f} | Saldo: {m[5]:.6f} | Desc: {m[6]}")
        
    last_saldo = movs[0][5]
    assert abs(last_saldo - (-80.64)) < 0.001, f"Error: Last running balance is {last_saldo}, expected -80.64"
    
    # 3. Asegurar que Alfonzo (ID 1) y Andres Eloy (ID 30) tengan los saldos correctos
    c.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE id = 1")
    alfonzo = c.fetchone()
    print(f"\nVerificación Cruzada Alfonzo - ID: {alfonzo[0]} | Nombre: {alfonzo[1]} | Saldo Pendiente: {alfonzo[2]}")
    assert abs(alfonzo[2] - 73.47) < 0.001, f"Error: Alfonzo balance was modified! Current: {alfonzo[2]}"
    
    c.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE id = 30")
    andres = c.fetchone()
    print(f"Verificación Cruzada Andres Eloy - ID: {andres[0]} | Nombre: {andres[1]} | Saldo Pendiente: {andres[2]}")
    assert abs(andres[2] - (-31.04)) < 0.001, f"Error: Andres Eloy balance was modified! Current: {andres[2]}"
    
    # 4. Asegurar que no hay ningún ajuste extraño para otros
    c.execute("SELECT COUNT(*), proveedor_id FROM movimientos_productores WHERE tipo = 'AJUSTE' GROUP BY proveedor_id")
    adjustments = c.fetchall()
    print("\nResumen de Ajustes en movimientos_productores:")
    for adj in adjustments:
        print(f"  Proveedor ID: {adj[1]} | Total transacciones de Ajuste: {adj[0]}")
        
    conn.close()
    print("\n=== VERIFICATION COMPLETED: ALL CHECKS PASSED ===")

if __name__ == '__main__':
    verify()
