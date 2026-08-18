import sqlite3

def trace():
    conn = sqlite3.connect("backups/respaldo_kalu_2026-05-20_02-58-16.db")
    c = conn.cursor()
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY fecha ASC, id ASC
    """)
    rows = c.fetchall()
    conn.close()
    
    print(f"{'ID':4s} | {'Fecha':10s} | {'Tipo':10s} | {'Debe':6s} | {'Haber':6s} | {'DB Saldo':9s} | {'Formula 1':9s} | {'Formula 2':9s} | {'Description':40s}")
    print("-" * 120)
    
    f1 = 0.0
    f2 = 0.0
    for r in rows:
        mid, fecha, tipo, debe, haber, db_saldo, desc = r
        d = float(debe or 0)
        h = float(haber or 0)
        
        # Formula 1: Standard
        f1 = f1 + h - d
        
        # Formula 2: ABONO_POS always treated as credit
        if tipo == 'ABONO_POS':
            # in backup, it was added
            f2 = f2 + h + d
        else:
            f2 = f2 + h - d
            
        print(f"{mid:4d} | {fecha[:10]:10s} | {tipo:10s} | {d:6.2f} | {h:6.2f} | {db_saldo:9.2f} | {f1:9.2f} | {f2:9.2f} | {desc[:40]}")

if __name__ == '__main__':
    trace()
