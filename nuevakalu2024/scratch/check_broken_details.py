import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

# Query all detalles_ventas and see if their producto_id exists in productos
c.execute("""
    SELECT dv.id, dv.venta_id, dv.producto_id 
    FROM detalles_ventas dv
    LEFT JOIN productos p ON dv.producto_id = p.id
    WHERE p.id IS NULL
""")
broken = c.fetchall()
print("Broken product references in sales details:")
for b in broken:
    print(f"Detail ID: {b[0]} | Venta ID: {b[1]} | Missing Product ID: {b[2]}")

# Also check for empty/invalid dates or other things
c.execute("SELECT id FROM ventas ORDER BY id DESC LIMIT 300")
recent_ids = [r[0] for r in c.fetchall()]

print(f"\nChecking last 300 sales (IDs: {recent_ids[:5]} ... {recent_ids[-5:]}) for missing products:")
c.execute(f"""
    SELECT dv.venta_id, dv.producto_id
    FROM detalles_ventas dv
    LEFT JOIN productos p ON dv.producto_id = p.id
    WHERE dv.venta_id IN ({','.join(map(str, recent_ids))}) AND p.id IS NULL
""")
recent_broken = c.fetchall()
print(f"Found {len(recent_broken)} broken product references in the last 300 sales.")
for rb in recent_broken:
    print(rb)

conn.close()
