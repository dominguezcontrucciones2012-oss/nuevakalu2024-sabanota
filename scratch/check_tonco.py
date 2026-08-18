import sqlite3

def check_tonco():
    conn = sqlite3.connect('d:/nuevakalu2024/instance/kalu_master.db')
    cursor = conn.cursor()
    
    # Obtener el saldo del proveedor en la tabla proveedores
    proveedor = cursor.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE id=5").fetchone()
    print(f"PROVEEDOR: {proveedor}")
    
    # Obtener movimientos
    movs = cursor.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion 
        FROM movimientos_productores 
        WHERE proveedor_id=5 
        ORDER BY fecha ASC, id ASC
    """).fetchall()
    
    print("\nMOVIMIENTOS:")
    for m in movs:
        print(m)

if __name__ == '__main__':
    check_tonco()
