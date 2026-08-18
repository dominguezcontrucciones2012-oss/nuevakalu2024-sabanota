import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

print("=== Movimientos Productores on May 19/20 ===")
c.execute("""
    SELECT m.id, m.proveedor_id, p.nombre, m.fecha, m.tipo, m.debe, m.haber, m.descripcion
    FROM movimientos_productores m
    LEFT JOIN proveedores p ON m.proveedor_id = p.id
    WHERE m.fecha >= '2026-05-19 00:00:00'
    ORDER BY m.fecha ASC
""")
for r in c.fetchall():
    print(r)

print("\n=== Auditoria Inventario on May 19/20 ===")
c.execute("""
    SELECT id, usuario_nombre, producto_nombre, accion, cantidad_antes, cantidad_despues, fecha
    FROM auditoria_inventario
    WHERE fecha >= '2026-05-19 00:00:00'
    ORDER BY fecha ASC
""")
for r in c.fetchall():
    print(r)

print("\n=== Asientos on May 19/20 ===")
c.execute("""
    SELECT id, descripcion, referencia_tipo, referencia_id, fecha
    FROM asientos
    WHERE fecha >= '2026-05-19 00:00:00'
    ORDER BY fecha ASC
""")
for r in c.fetchall():
    print(r)

conn.close()
