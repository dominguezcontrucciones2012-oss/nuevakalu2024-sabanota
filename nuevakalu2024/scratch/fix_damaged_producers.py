import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

# Productores descuadrados detectados: 14, 15, 17, 18, 22
# Para cada uno: recalcular saldo_momento cronológicamente y actualizar proveedores.saldo_pendiente_usd
producers_to_fix = [14, 15, 17, 18, 22]

print("=== CORRECCIÓN QUIRÚRGICA DE SALDOS DESCUADRADOS ===\n")
print("IMPORTANTE: El script de Tonco NO causó este daño.")
print("Estos saldos ya estaban descuadrados (restauración de DB anterior).\n")

for pid in producers_to_fix:
    c.execute('SELECT nombre, saldo_pendiente_usd FROM proveedores WHERE id=?', (pid,))
    prov = c.fetchone()
    nombre, saldo_actual = prov
    
    c.execute('''
        SELECT id, fecha, tipo, debe, haber, saldo_momento
        FROM movimientos_productores
        WHERE proveedor_id = ?
        ORDER BY fecha ASC, id ASC
    ''', (pid,))
    rows = c.fetchall()
    
    running = 0.0
    for r in rows:
        mid, fecha, tipo, debe, haber, saldo_momento = r
        debe = float(debe or 0)
        haber = float(haber or 0)
        running = running + haber - debe
        c.execute("UPDATE movimientos_productores SET saldo_momento = ? WHERE id = ?", (running, mid))
    
    # Actualizar saldo del proveedor
    c.execute("UPDATE proveedores SET saldo_pendiente_usd = ? WHERE id = ?", (running, pid))
    
    print(f"Proveedor {pid} | {nombre}")
    print(f"  saldo_db antes: {float(saldo_actual or 0):+.2f}")
    print(f"  saldo_recalc:   {running:+.2f}")
    print(f"  movimientos corregidos: {len(rows)}")
    print()

conn.commit()
conn.close()
print("=== CORRECCIÓN COMPLETADA ===")
