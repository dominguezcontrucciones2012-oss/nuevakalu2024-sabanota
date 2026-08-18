import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

print("=== Compras for Moises Esqueda (ID 40) ===")
c.execute("""
    SELECT id, numero_factura, fecha, total_usd, metodo_pago, estado
    FROM compras
    WHERE proveedor_id = 40
    ORDER BY id DESC LIMIT 2
""")
for r in c.fetchall():
    print(r)

print("\n=== Cuentas Por Pagar for Moises Esqueda (ID 40) ===")
c.execute("""
    SELECT id, compra_id, numero_factura, fecha, monto_total_usd, monto_abonado_usd, saldo_pendiente_usd, estatus
    FROM cuentas_por_pagar
    WHERE proveedor_id = 40
    ORDER BY id DESC LIMIT 2
""")
for r in c.fetchall():
    print(r)

conn.close()
