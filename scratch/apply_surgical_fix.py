import sqlite3
from decimal import Decimal

db_path = "instance/kalu_master.db"

def run_fix():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    print("=== START SURGICAL FIX FOR TONCO MARTINEZ (ID 5) ===")
    
    # 1. Correct ABONO_POS sign errors for Tonco
    c.execute("""
        SELECT id, debe, haber, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 5 AND tipo = 'ABONO_POS'
    """)
    abonos = c.fetchall()
    corrected_count = 0
    for row in abonos:
        mid, debe, haber, desc = row
        debe_val = float(debe or 0.0)
        haber_val = float(haber or 0.0)
        if debe_val > 0.0 and haber_val == 0.0:
            new_desc = f"[CORREGIDO SIGNOS] {desc}"
            c.execute("""
                UPDATE movimientos_productores
                SET debe = 0.00, haber = ?, descripcion = ?
                WHERE id = ?
            """, (debe_val, new_desc, mid))
            corrected_count += 1
            print(f"Corrected ABONO_POS ID {mid}: moved {debe_val} from Debe to Haber.")
    print(f"Total corrected ABONO_POS rows: {corrected_count}")
    
    # 2. Check if the 19.8 kg cheese delivery is already there (to avoid duplicates)
    c.execute("""
        SELECT id FROM movimientos_productores
        WHERE proveedor_id = 5 AND tipo = 'ENTREGA_QUESO' AND kilos = 19.8
    """)
    if c.fetchone():
        print("Warning: 19.8 kg cheese delivery already exists! Skipping insertion.")
    else:
        # Get QUESO stock details
        c.execute("SELECT stock FROM productos WHERE id = 27")
        queso_stock = c.fetchone()[0]
        new_queso_stock = queso_stock + 19.8
        
        # Update product stock
        c.execute("UPDATE productos SET stock = ? WHERE id = 27", (new_queso_stock,))
        print(f"Updated QUESO stock from {queso_stock} to {new_queso_stock}")
        
        # Insert AuditoriaInventario
        c.execute("""
            INSERT INTO auditoria_inventario (usuario_id, usuario_nombre, producto_id, producto_nombre, accion, cantidad_antes, cantidad_despues, fecha)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (234, 'juancarlos', 27, 'QUESO', 'RECEPCION_QUESO', queso_stock, new_queso_stock, '2026-05-19 18:00:00.000000'))
        print("Inserted AuditoriaInventario record.")
        
        # Insert Asiento
        c.execute("""
            INSERT INTO asientos (descripcion, tasa_referencia, referencia_tipo, referencia_id, user_id, fecha)
            VALUES (?, ?, ?, ?, ?, ?)
        """, ('COMPRA QUESO: 19.8kg de TONCO MARTINEZ | Pago: CREDITO', 520.00, 'COMPRA_QUESO', 5, 1, '2026-05-19 18:00:00.000000'))
        asiento_id = c.lastrowid
        print(f"Inserted Asiento ID: {asiento_id}")
        
        # Get accounts ids
        c.execute("SELECT id FROM cuentas_contables WHERE codigo = '1.1.03.01'")
        cta_inv_id = c.fetchone()[0]
        c.execute("SELECT id FROM cuentas_contables WHERE codigo = '1.1.02.02'")
        cta_deuda_id = c.fetchone()[0]
        c.execute("SELECT id FROM cuentas_contables WHERE codigo = '2.1.01.01'")
        cta_cxp_id = c.fetchone()[0]
        
        # Insert DetalleAsiento (Debit Inventario $83.16, Credit Productores $73.79, Credit CXP $9.37)
        c.execute("""
            INSERT INTO detalles_asientos (asiento_id, cuenta_id, debe_usd, haber_usd, debe_bs, haber_bs)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (asiento_id, cta_inv_id, 83.16, 0.0, 83.16 * 520.00, 0.0))
        
        c.execute("""
            INSERT INTO detalles_asientos (asiento_id, cuenta_id, debe_usd, haber_usd, debe_bs, haber_bs)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (asiento_id, cta_deuda_id, 0.0, 73.79, 0.0, 73.79 * 520.00))
        
        c.execute("""
            INSERT INTO detalles_asientos (asiento_id, cuenta_id, debe_usd, haber_usd, debe_bs, haber_bs)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (asiento_id, cta_cxp_id, 0.0, 9.37, 0.0, 9.37 * 520.00))
        print("Inserted DetalleAsiento records.")
        
        # Insert Compra
        c.execute("""
            INSERT INTO compras (proveedor_id, numero_factura, fecha, total_usd, metodo_pago, estado)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (5, 'ENTREGA-202605191800', '2026-05-19 18:00:00.000000', 83.16, 'Credito', 'Pendiente'))
        compra_id = c.lastrowid
        print(f"Inserted Compra ID: {compra_id}")
        
        # Insert CuentaPorPagar
        c.execute("""
            INSERT INTO cuentas_por_pagar (proveedor_id, compra_id, numero_factura, fecha, monto_total_usd, monto_abonado_usd, saldo_pendiente_usd, estatus)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (5, compra_id, 'ENTREGA-202605191800', '2026-05-19 18:00:00.000000', 83.16, 0.00, 83.16, 'Pendiente'))
        print("Inserted CuentaPorPagar record.")
        
        # Insert MovimientoProductor
        c.execute("""
            INSERT INTO movimientos_productores (proveedor_id, tipo, descripcion, kilos, monto_usd, debe, haber, saldo_momento, anio, semana_del_anio, fecha)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (5, 'ENTREGA_QUESO', 'Recibido 19.8kg. Pago CREDITO: $0.00', 19.80, 0.00, 0.00, 83.16, 0.00, 2026, 21, '2026-05-19 18:00:00.000000'))
        print("Inserted MovimientoProductor record.")

    # 3. Recalculate balances for Tonco Martínez
    c.execute("""
        SELECT id, debe, haber, tipo, descripcion, fecha
        FROM movimientos_productores
        WHERE proveedor_id = 5
        ORDER BY fecha ASC, id ASC
    """)
    rows = c.fetchall()
    print(f"\nRecalculating balances for Tonco Martínez ({len(rows)} movements):")
    running = 0.0
    for idx, row in enumerate(rows):
        mid, debe, haber, tipo, desc, date = row
        debe = float(debe or 0.0)
        haber = float(haber or 0.0)
        running = running + haber - debe
        c.execute("UPDATE movimientos_productores SET saldo_momento = ? WHERE id = ?", (running, mid))
        print(f"  Row {idx+1:2d} | ID {mid:4d} | Date {date} | {tipo:12s} | Debe/Haber: {debe:.2f}/{haber:.2f} | New Saldo: {running:+.2f} | {desc[:30]}")
        
    # Update suppliers table
    c.execute("UPDATE proveedores SET saldo_pendiente_usd = ? WHERE id = 5", (running,))
    print(f"\nUpdated supplier Tonco Martinez (ID 5) saldo_pendiente_usd to {running:+.2f}")
    
    conn.commit()
    conn.close()
    print("=== SURGICAL FIX COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_fix()
