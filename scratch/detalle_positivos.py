import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

# Show all movements for the 5 positive-balance producers
for pid in [15, 14, 22, 18, 17]:
    c.execute('SELECT nombre FROM proveedores WHERE id=?', (pid,))
    nombre = c.fetchone()[0]
    c.execute('''
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores WHERE proveedor_id=?
        ORDER BY fecha ASC, id ASC
    ''', (pid,))
    rows = c.fetchall()
    print(f"\n=== {pid}: {nombre} ===")
    for r in rows:
        mid, fecha, tipo, debe, haber, saldo, desc = r
        print(f"  {fecha[:10]} | {tipo:<18} | D={float(debe or 0):7.2f} | H={float(haber or 0):7.2f} | saldo={float(saldo or 0):+8.2f} | {(desc or '')[:50]}")

conn.close()
