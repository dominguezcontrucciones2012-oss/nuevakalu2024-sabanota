import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

# Show ALL producers with their balance and what it means
c.execute('''
    SELECT p.id, p.nombre, p.saldo_pendiente_usd,
           (SELECT COUNT(*) FROM movimientos_productores WHERE proveedor_id = p.id) as n_movs,
           (SELECT MAX(fecha) FROM movimientos_productores WHERE proveedor_id = p.id) as ultimo_mov
    FROM proveedores p
    WHERE p.id IN (SELECT DISTINCT proveedor_id FROM movimientos_productores)
    ORDER BY p.saldo_pendiente_usd ASC
''')
rows = c.fetchall()

print("=== RESUMEN LIBRETA DE PRODUCTORES ===\n")
print(f"{'ID':>3} | {'Nombre':<22} | {'Saldo USD':>11} | {'Significado':>35} | {'Movs':>4} | Ultimo Mov")
print("-"*110)
for r in rows:
    pid, nombre, saldo, n, ultimo = r
    saldo = float(saldo or 0)
    if saldo < -0.01:
        significado = f"EL PRODUCTOR DEBE al negocio"
    elif saldo > 0.01:
        significado = f"EL NEGOCIO DEBE al productor"
    else:
        significado = "A CERO / AL DIA"
    print(f"{pid:>3} | {nombre:<22} | {saldo:>+11.2f} | {significado:<35} | {n:>4} | {(ultimo or '')[:10]}")

conn.close()
