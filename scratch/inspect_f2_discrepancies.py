import sqlite3

def find_discrepancies():
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
    
    print(f"{'Index':5s} | {'ID':4s} | {'Fecha':10s} | {'Tipo':10s} | {'Debe':6s} | {'Haber':6s} | {'DB Saldo':9s} | {'Formula 2':9s} | {'Diff':7s} | {'Desc':40s}")
    print("-" * 120)
    
    f2 = 0.0
    for i, r in enumerate(rows):
        mid, fecha, tipo, debe, haber, db_saldo, desc = r
        d = float(debe or 0)
        h = float(haber or 0)
        
        # Formula 2
        if tipo == 'ABONO_POS':
            f2 = f2 + h + d
        else:
            f2 = f2 + h - d
            
        diff = db_saldo - f2
        if abs(diff) > 0.01:
            print(f"{i:5d} | {mid:4d} | {fecha[:10]:10s} | {tipo:10s} | {d:6.2f} | {h:6.2f} | {db_saldo:9.2f} | {f2:9.2f} | {diff:+7.2f} | {desc[:40]}")

if __name__ == '__main__':
    find_discrepancies()
