import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

for pid in [14, 15, 17, 18, 22]:
    c.execute('SELECT nombre, saldo_pendiente_usd FROM proveedores WHERE id=?', (pid,))
    prov = c.fetchone()
    c.execute('''
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = ?
        ORDER BY fecha ASC, id ASC
    ''', (pid,))
    rows = c.fetchall()
    print(f'\n--- Proveedor {pid}: {prov[0]} | saldo_db={float(prov[1] or 0):+.2f} ---')
    running = 0.0
    for r in rows:
        mid, fecha, tipo, debe, haber, saldo_momento, desc = r
        debe = float(debe or 0)
        haber = float(haber or 0)
        running = running + haber - debe
        match = abs(running - float(saldo_momento or 0)) < 0.02
        flag = "" if match else " <-DIFF"
        print(f'  ID={mid:5d} {fecha[:10]} {tipo:14s} D={debe:8.2f} H={haber:8.2f} momento={float(saldo_momento or 0):+9.2f} recalc={running:+9.2f}{flag}')
    print(f'  => ultimo recalc={running:+.2f} vs db={float(prov[1] or 0):+.2f}')

conn.close()
