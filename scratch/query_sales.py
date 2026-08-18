import sqlite3

def check_andres_history():
    conn = sqlite3.connect('instance/kalu_master.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("=== HISTORIAL COMPLETO DE MOVIMIENTOS DE ANDRES ELOY ===")
    cursor.execute("""
        SELECT * FROM movimientos_productores 
        WHERE proveedor_id = 30
        ORDER BY id ASC
    """)
    for r in cursor.fetchall():
        print(f"ID: {r['id']} | Fecha: {r['fecha']} | Tipo: {r['tipo']} | Desc: {r['descripcion']} | Debe: {r['debe']} | Haber: {r['haber']} | Saldo: {r['saldo_momento']}")
        
    conn.close()

if __name__ == '__main__':
    check_andres_history()
