import sqlite3

def check():
    conn = sqlite3.connect("instance/kalu_master.db")
    c = conn.cursor()
    
    print("=== TRANSACTIONS ON 2026-04-13 FOR ID 19 ===")
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 19 AND fecha LIKE '2026-04-13%'
    """)
    for r in c.fetchall():
        print(r)
        
    print("\n=== TRANSACTIONS ON 2026-04-13 FOR ID 30 ===")
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30 AND fecha LIKE '2026-04-13%'
    """)
    for r in c.fetchall():
        print(r)
        
    conn.close()

if __name__ == '__main__':
    check()
