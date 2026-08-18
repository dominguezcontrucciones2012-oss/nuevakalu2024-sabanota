import sqlite3

def check_prewipe():
    db = "backups/respaldo_kalu_AUTO_PRE_WIPE_2026-04-29_10-32-34.db"
    conn = sqlite3.connect(db)
    c = conn.cursor()
    
    # Let's search for IDs 450 to 460
    c.execute("""
        SELECT id, proveedor_id, fecha, tipo, debe, haber, descripcion
        FROM movimientos_productores
        WHERE id BETWEEN 450 AND 460
    """)
    print("=== Transactions between 450 and 460 in pre-wipe DB ===")
    for r in c.fetchall():
        print(r)
        
    # Also let's find all transactions for provider 30
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30 AND fecha LIKE '2026-04-10%'
    """)
    print("\n=== Provider 30 transactions on 2026-04-10 in pre-wipe DB ===")
    for r in c.fetchall():
        print(r)
        
    conn.close()

if __name__ == '__main__':
    check_prewipe()
