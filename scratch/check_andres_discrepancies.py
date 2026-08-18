import sqlite3

def check_discrepancies():
    conn = sqlite3.connect("backups/respaldo_kalu_2026-05-20_02-58-16.db")
    c = conn.cursor()
    c.execute("""
        SELECT m.id, m.fecha, m.tipo, m.debe, m.haber, m.saldo_momento, m.descripcion
        FROM movimientos_productores m
        WHERE m.proveedor_id = 30
        ORDER BY m.fecha ASC, m.id ASC
    """)
    rows = c.fetchall()
    conn.close()
    
    print(f"{'Index':5s} | {'ID':4s} | {'Fecha':23s} | {'Tipo':10s} | {'Debe':8s} | {'Haber':8s} | {'DB Saldo':10s} | {'Diff':8s} | {'Expected':8s} | {'Desc':40s}")
    print("-" * 140)
    
    prev_db_saldo = 0.0
    for i, r in enumerate(rows):
        mid, fecha, tipo, debe, haber, db_saldo, desc = r
        debe = float(debe or 0)
        haber = float(haber or 0)
        db_saldo = float(db_saldo or 0)
        
        diff = db_saldo - prev_db_saldo
        expected = haber - debe
        
        if abs(diff - expected) > 0.01:
            print(f"{i:5d} | {mid:4d} | {fecha:23s} | {tipo:10s} | {debe:8.2f} | {haber:8.2f} | {db_saldo:10.2f} | {diff:+8.2f} | {expected:+8.2f} | {desc[:40]}")
            
        prev_db_saldo = db_saldo

if __name__ == '__main__':
    check_discrepancies();
