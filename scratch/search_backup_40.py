import sqlite3

def search():
    db = "backups/respaldo_kalu_2026-05-20_02-58-16.db"
    conn = sqlite3.connect(db)
    c = conn.cursor()
    
    print("=== Searching movements for 40.00 ===")
    c.execute("""
        SELECT id, proveedor_id, fecha, tipo, debe, haber, descripcion
        FROM movimientos_productores
        WHERE debe = 40 OR haber = 40 OR descripcion LIKE '%40%'
    """)
    for r in c.fetchall():
        print(r)
        
    print("\n=== Searching asientos for 40.00 ===")
    c.execute("""
        SELECT a.id, a.fecha, a.descripcion, d.debe_usd, d.haber_usd
        FROM asientos a JOIN detalles_asientos d ON a.id = d.asiento_id
        WHERE d.debe_usd = 40 OR d.haber_usd = 40
    """)
    for r in c.fetchall():
        print(r)
        
    conn.close()

if __name__ == '__main__':
    search()
