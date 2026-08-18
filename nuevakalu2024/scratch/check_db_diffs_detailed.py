import sqlite3

def check_diffs():
    conn_m = sqlite3.connect("instance/kalu_master.db")
    c_m = conn_m.cursor()
    c_m.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY fecha ASC, id ASC
    """)
    master_rows = {r[0]: r for r in c_m.fetchall()}
    conn_m.close()

    conn_b = sqlite3.connect("backups/respaldo_kalu_2026-05-19_01-11-31.db")
    c_b = conn_b.cursor()
    c_b.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY fecha ASC, id ASC
    """)
    backup_rows = {r[0]: r for r in c_b.fetchall()}
    conn_b.close()

    all_ids = sorted(list(set(master_rows.keys()) | set(backup_rows.keys())))

    with open("scratch/db_diffs_detailed.txt", "w", encoding="utf-8") as f:
        f.write(f"{'ID':4s} | {'Date':23s} | {'Master Debe':11s} | {'Backup Debe':11s} | {'Master Haber':12s} | {'Backup Haber':12s} | {'Master Saldo':12s} | {'Backup Saldo':12s}\n")
        f.write("-" * 120 + "\n")
        for mid in all_ids:
            mr = master_rows.get(mid)
            br = backup_rows.get(mid)
            
            m_debe = f"{mr[3]:.2f}" if mr else "N/A"
            b_debe = f"{br[3]:.2f}" if br else "N/A"
            m_haber = f"{mr[4]:.2f}" if mr else "N/A"
            b_haber = f"{br[4]:.2f}" if br else "N/A"
            m_saldo = f"{mr[5]:.2f}" if mr else "N/A"
            b_saldo = f"{br[5]:.2f}" if br else "N/A"
            date = mr[1] if mr else (br[1] if br else "")
            
            is_different = (m_debe != b_debe) or (m_haber != b_haber) or (m_saldo != b_saldo)
            diff_marker = " *DIFF*" if is_different else "      "
            f.write(f"{mid:4d} | {date:23s} | {m_debe:11s} | {b_debe:11s} | {m_haber:12s} | {b_haber:12s} | {m_saldo:12s} | {b_saldo:12s} {diff_marker}\n")

check_diffs()
