import sqlite3

dbs = {
    "Master": "instance/kalu_master.db",
    "Backup": "backups/respaldo_kalu_2026-05-20_02-58-16.db"
}

target_names = ["LUIS CORR0", "andres eloy", "DIANA APONTE", "DERSY CORRO", "Gordo miranda"]

for p_name_target in target_names:
    conn_m = sqlite3.connect(dbs["Master"])
    c_m = conn_m.cursor()
    c_m.execute("SELECT id, nombre FROM proveedores WHERE nombre LIKE ?", (f"%{p_name_target}%",))
    res = c_m.fetchone()
    if not res:
        print(f"Could not find {p_name_target} in Master.")
        conn_m.close()
        continue
    p_id, p_name = res
    
    c_m.execute("""
        SELECT id, fecha, tipo, debe, haber, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = ?
        ORDER BY fecha ASC, id ASC
    """, (p_id,))
    m_movs = c_m.fetchall()
    conn_m.close()
    
    conn_b = sqlite3.connect(dbs["Backup"])
    c_b = conn_b.cursor()
    c_b.execute("""
        SELECT id, fecha, tipo, debe, haber, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = ?
        ORDER BY fecha ASC, id ASC
    """, (p_id,))
    b_movs = c_b.fetchall()
    conn_b.close()
    
    print(f"=== {p_name} (ID {p_id}) ===")
    print(f"Master has {len(m_movs)} movs, Backup has {len(b_movs)} movs.")
    
    m_set = {x[0] for x in m_movs}
    b_set = {x[0] for x in b_movs}
    
    m_only = m_set - b_set
    b_only = b_set - m_set
    
    if m_only:
        print("  Only in Master:")
        for r in m_movs:
            if r[0] in m_only:
                print(f"    ID: {r[0]} | Date: {r[1]} | Type: {r[2]} | Debe: {r[3]} | Haber: {r[4]} | Desc: {r[5]}")
    if b_only:
        print("  Only in Backup:")
        for r in b_movs:
            if r[0] in b_only:
                print(f"    ID: {r[0]} | Date: {r[1]} | Type: {r[2]} | Debe: {r[3]} | Haber: {r[4]} | Desc: {r[5]}")
                
    if not m_only and not b_only:
        print("  IDs match exactly. Checking if any rows have different values...")
        for rm, rb in zip(m_movs, b_movs):
            if rm != rb:
                print(f"    Mismatch on ID {rm[0]}:")
                print(f"      Master: {rm}")
                print(f"      Backup: {rb}")
    print("-" * 80)
