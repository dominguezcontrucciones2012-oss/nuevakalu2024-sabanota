import sqlite3

db_path = "instance/kalu_master.db.pre-restore"
conn = sqlite3.connect(db_path)
c = conn.cursor()

producers = [1, 2, 3, 4, 6, 7, 8, 9, 10, 19, 24, 25, 26, 29, 30, 31, 32, 36]

print("=== INSPECTING PRE-RESTORE DB ===")
for pid in producers:
    c.execute("SELECT nombre, saldo_pendiente_usd FROM proveedores WHERE id = ?", (pid,))
    prov = c.fetchone()
    if prov:
        name, bal = prov
        # Get last movement saldo_momento
        c.execute("SELECT saldo_momento FROM movimientos_productores WHERE proveedor_id = ? ORDER BY fecha DESC, id DESC LIMIT 1", (pid,))
        mov_bal = c.fetchone()
        mov_bal_val = mov_bal[0] if mov_bal else None
        print(f"ID: {pid:<2} | Name: {name:<25} | DB Bal: {bal:+.2f} | Mov Bal: {mov_bal_val}")
    else:
        print(f"ID: {pid} not found")

conn.close()
