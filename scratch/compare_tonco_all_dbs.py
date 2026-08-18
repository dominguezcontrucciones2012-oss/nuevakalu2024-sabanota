import sqlite3

def get_all_movs(db_path):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 5
        ORDER BY fecha ASC, id ASC
    """)
    rows = c.fetchall()
    conn.close()
    return rows

master_movs = get_all_movs("instance/kalu_master.db")
backup_movs = get_all_movs("backups/respaldo_kalu_2026-05-20_02-58-16.db")

print(f"Master has {len(master_movs)} movements, Backup has {len(backup_movs)} movements.")

# Print side-by-side or highlight differences
max_len = max(len(master_movs), len(backup_movs))
for i in range(max_len):
    m_row = master_movs[i] if i < len(master_movs) else None
    b_row = backup_movs[i] if i < len(backup_movs) else None
    
    if m_row and b_row:
        mid_m, f_m, t_m, d_m, h_m, s_m, desc_m = m_row
        mid_b, f_b, t_b, d_b, h_b, s_b, desc_b = b_row
        
        diff_val = s_m - s_b
        # If there's any difference in values
        val_diff = (mid_m != mid_b or t_m != t_b or d_m != d_b or h_m != h_b)
        flag = " [DIFF]" if val_diff or abs(diff_val) > 0.01 else ""
        
        print(f"{i:3d} | M_ID: {mid_m:4d} B_ID: {mid_b:4d} | Type M/B: {t_m:10s}/{t_b:10s} | Debe M/B: {d_m:6.2f}/{d_b:6.2f} | Haber M/B: {h_m:6.2f}/{h_b:6.2f} | Saldo M/B: {s_m:8.2f}/{s_b:8.2f} | Diff: {diff_val:8.2f}{flag}")
    else:
        print(f"{i:3d} | Master: {m_row} | Backup: {b_row}")
