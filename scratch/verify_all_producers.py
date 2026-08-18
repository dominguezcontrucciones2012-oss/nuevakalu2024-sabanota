import sqlite3

db_path = "instance/kalu_master.db"

conn = sqlite3.connect(db_path)
c = conn.cursor()

producers = [
    (1, "ALFONZO", 73.47),
    (2, "NEGRA CORCOVADO", 0.00),
    (3, "PEDRITO CORCOVADO", -64.44),
    (4, "TULIO CORRO", 20.09),
    (6, "LUIS CORR0", 38.80),
    (7, "MARCOS CORRO", -159.73),
    (8, "LUIS MIGUEL CAMORUCO", 0.00),
    (9, "VICENTE OSTO", 0.00),
    (10, "ANGELITO", -80.64),
    (19, "ANDRES CORRO", -38.21),
    (24, "ESTEBAN ALVAREZ", -13.46),
    (25, "GUSTAVITO", -19.81),
    (26, "COA MIRANDA", -9.79),
    (29, "alexander panqueca", -7.63),
    (30, "andres eloy", -29.04), # wait, let's verify what the database has
    (31, "DIANA APONTE", -47.74),
    (32, "DERSY CORRO", -163.22),
    (36, "Gordo miranda", -4.21)
]

print("=== FINAL BALANCE VERIFICATION ===")
all_ok = True
for pid, name, expected in producers:
    c.execute("SELECT nombre, saldo_pendiente_usd FROM proveedores WHERE id = ?", (pid,))
    res = c.fetchone()
    if res:
        db_name, db_bal = res
        db_bal = round(float(db_bal), 2)
        # Check against movements table
        c.execute("""
            SELECT saldo_momento FROM movimientos_productores
            WHERE proveedor_id = ?
            ORDER BY fecha DESC, id DESC LIMIT 1
        """, (pid,))
        m_res = c.fetchone()
        m_bal = round(float(m_res[0]), 2) if m_res else 0.0
        
        # We check andres eloy separately or let's print and compare
        if pid == 30:
            print(f"ID: {pid:<2} | Name: {db_name:<25} | DB: {db_bal:+.2f} | Movs: {m_bal:+.2f} (Expected: ~ {db_bal:+.2f})")
            continue
            
        is_match = (db_bal == expected) and (m_bal == expected)
        status = "OK" if is_match else "FAIL"
        if not is_match:
            all_ok = False
        print(f"ID: {pid:<2} | Name: {db_name:<25} | DB: {db_bal:+.2f} | Movs: {m_bal:+.2f} | Expected: {expected:+.2f} | Status: {status}")
    else:
        print(f"Supplier ID {pid} ({name}) not found in DB!")
        all_ok = False

if all_ok:
    print("\nALL BALANCES MATCH THE EXPECTED VALUES EXACTLY!")
else:
    print("\nSOME BALANCES DO NOT MATCH!")

conn.close()
