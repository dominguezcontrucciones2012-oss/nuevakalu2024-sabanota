import sqlite3

def compare():
    conn_m = sqlite3.connect("instance/kalu_master.db")
    c_m = conn_m.cursor()
    c_m.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY fecha ASC, id ASC
    """)
    master_rows = {r[0]: r for r in c_m.fetchall()}
    
    conn_b = sqlite3.connect("backups/respaldo_kalu_2026-05-20_02-58-16.db")
    c_b = conn_b.cursor()
    c_b.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY fecha ASC, id ASC
    """)
    backup_rows = {r[0]: r for r in c_b.fetchall()}
    
    all_ids = sorted(list(set(master_rows.keys()).union(set(backup_rows.keys()))))
    
    print(f"{'ID':4s} | {'Fecha':23s} | {'M_Debe':8s}/{'B_Debe':8s} | {'M_Haber':8s}/{'B_Haber':8s} | {'M_Saldo':8s}/{'B_Saldo':8s} | {'Desc':40s}")
    print("-" * 120)
    for mid in all_ids:
        mr = master_rows.get(mid)
        br = backup_rows.get(mid)
        
        m_fecha = mr[1] if mr else ""
        m_debe = f"{mr[3]:.2f}" if mr else "None"
        m_haber = f"{mr[4]:.2f}" if mr else "None"
        m_saldo = f"{mr[5]:.2f}" if mr else "None"
        m_desc = mr[6] if mr else ""
        
        b_debe = f"{br[3]:.2f}" if br else "None"
        b_haber = f"{br[4]:.2f}" if br else "None"
        b_saldo = f"{br[5]:.2f}" if br else "None"
        
        if m_saldo != b_saldo or m_debe != b_debe or m_haber != b_haber:
            print(f"{mid:4d} | {m_fecha:23s} | {m_debe:8s}/{b_debe:8s} | {m_haber:8s}/{b_haber:8s} | {m_saldo:8s}/{b_saldo:8s} | {m_desc[:40]}")
            
    conn_m.close()
    conn_b.close()

if __name__ == '__main__':
    compare()
