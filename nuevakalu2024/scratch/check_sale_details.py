import sqlite3
import os

db_path = r'D:\nuevakalu2024\instance\kalu_master.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    sale_id = 2328
    print(f"--- Details for Sale ID: {sale_id} ---")
    
    cursor.execute("""
        SELECT v.id, v.fecha, v.total_usd, v.tasa_momento, v.pago_movil_bs, v.biopago_bdv, v.pago_efectivo_bs
        FROM ventas v
        WHERE v.id = ?
    """, (sale_id,))
    sale = cursor.fetchone()
    print(f"Sale Info: {sale}")
    
    print("\n--- Items ---")
    cursor.execute("""
        SELECT dv.cantidad, dv.precio_unitario_usd, p.nombre, p.codigo
        FROM detalles_ventas dv
        JOIN productos p ON dv.producto_id = p.id
        WHERE dv.venta_id = ?
    """, (sale_id,))
    items = cursor.fetchall()
    for item in items:
        print(f"Cant: {item[0]} | Precio USD: {item[1]} | Producto: {item[2]} ({item[3]})")
    
    conn.close()
else:
    print(f"Database not found at {db_path}")
