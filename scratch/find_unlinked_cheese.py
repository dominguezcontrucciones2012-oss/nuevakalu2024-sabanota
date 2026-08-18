import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
conn.row_factory = sqlite3.Row
c = conn.cursor()

# Get all COMPRA_QUESO asientos since May 15
c.execute("""
    SELECT a.id as asiento_id, a.fecha, a.descripcion, a.referencia_id as proveedor_id, p.nombre as proveedor_nombre
    FROM asientos a
    LEFT JOIN proveedores p ON a.referencia_id = p.id
    WHERE a.referencia_tipo = 'COMPRA_QUESO' AND a.fecha >= '2026-05-15'
""")
asientos = [dict(r) for r in c.fetchall()]
print(f"=== COMPRA_QUESO ASIENTOS ({len(asientos)} found since May 15) ===")
for a in asientos:
    print(a)

# Get all COMPRA_QUESO compras since May 15
c.execute("""
    SELECT co.id as compra_id, co.fecha, co.numero_factura, co.proveedor_id, p.nombre as proveedor_nombre, co.total_usd
    FROM compras co
    LEFT JOIN proveedores p ON co.proveedor_id = p.id
    WHERE co.numero_factura LIKE 'ENTREGA-%' AND co.fecha >= '2026-05-15'
""")
compras = [dict(r) for r in c.fetchall()]
print(f"\n=== COMPRA_QUESO COMPRAS ({len(compras)} found since May 15) ===")
for co in compras:
    print(co)

# Get all ENTREGA_QUESO movements since May 15
c.execute("""
    SELECT m.id as mov_id, m.fecha, m.proveedor_id, p.nombre as proveedor_nombre, m.kilos, m.haber, m.debe, m.descripcion
    FROM movimientos_productores m
    LEFT JOIN proveedores p ON m.proveedor_id = p.id
    WHERE m.tipo = 'ENTREGA_QUESO' AND m.fecha >= '2026-05-15'
""")
movs = [dict(r) for r in c.fetchall()]
print(f"\n=== ENTREGA_QUESO MOVEMENTS ({len(movs)} found since May 15) ===")
for m in movs:
    print(m)

# Find if any Compra or Asiento doesn't have a matching MovimientoProductor
print("\n=== UNLINKED CHEESE RECEIPTS ===")
for a in asientos:
    # try to find a movement matching provider and date close to it
    matched = [m for m in movs if m['proveedor_id'] == a['proveedor_id'] and m['fecha'][:10] == a['fecha'][:10]]
    if not matched:
        print(f"ASIENTO WITHOUT MOVEMENT: {a}")

for co in compras:
    matched = [m for m in movs if m['proveedor_id'] == co['proveedor_id'] and m['fecha'][:10] == co['fecha'][:10]]
    if not matched:
        print(f"COMPRA WITHOUT MOVEMENT: {co}")

conn.close()
