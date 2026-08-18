import sqlite3

def print_id_sort():
    conn = sqlite3.connect("backups/respaldo_kalu_2026-05-20_02-58-16.db")
    c = conn.cursor()
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY id ASC
    """)
    rows = c.fetchall()
    conn.close()
    
    print(f"{'Index':5s} | {'ID':4s} | {'Fecha':10s} | {'Tipo':10s} | {'Debe':6s} | {'Haber':6s} | {'DB Saldo':9s} | {'Calc Std':9s} | {'Calc Bug':9s} | {'Desc':40s}")
    print("-" * 130)
    
    calc_std = 0.0
    calc_bug = 0.0
    for idx, r in enumerate(rows):
        mid, fecha, tipo, debe, haber, db_saldo, desc = r
        d = float(debe or 0)
        h = float(haber or 0)
        
        calc_std = calc_std + h - d
        if tipo == 'ABONO_POS':
            calc_bug = calc_bug + h + d
        else:
            calc_bug = calc_bug + h - d
            
        print(f"{idx:5d} | {mid:4d} | {fecha[:10]:10s} | {tipo:10s} | {d:6.2f} | {h:6.2f} | {db_saldo:9.2f} | {calc_std:9.2f} | {calc_bug:9.2f} | {desc[:40]}")

if __name__ == '__main__':
    print_id_sort()
