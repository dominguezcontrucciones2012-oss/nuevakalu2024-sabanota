import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
conn.row_factory = sqlite3.Row
c = conn.cursor()

print("=== COMPRAS FOR TONCO MARTINEZ (ID 5) ===")
c.execute("SELECT * FROM compras WHERE proveedor_id = 5 ORDER BY id DESC LIMIT 5")
for r in c.fetchall():
    print(dict(r))

print("\n=== CUENTAS POR PAGAR FOR TONCO MARTINEZ (ID 5) ===")
c.execute("SELECT * FROM cuentas_por_pagar WHERE proveedor_id = 5 ORDER BY id DESC LIMIT 5")
for r in c.fetchall():
    print(dict(r))

print("\n=== ASIENTOS CONTAINING TONCO OR PROVEEDOR_ID 5 ===")
c.execute("SELECT * FROM asientos WHERE descripcion LIKE '%TONCO%' OR referencia_id = 5 ORDER BY id DESC LIMIT 5")
for r in c.fetchall():
    print(dict(r))

print("\n=== MOVIMIENTOS CAJA FOR PROVEEDOR 5 ===")
c.execute("SELECT * FROM movimientos_caja WHERE referencia_id = 5 AND modulo_origen = 'PRODUCTOR' ORDER BY id DESC LIMIT 5")
for r in c.fetchall():
    print(dict(r))

print("\n=== AUDITORIA INVENTARIO ON MAY 19 OR 20 ===")
c.execute("SELECT * FROM auditoria_inventario WHERE fecha >= '2026-05-18' ORDER BY id DESC LIMIT 10")
for r in c.fetchall():
    print(dict(r))

conn.close()
