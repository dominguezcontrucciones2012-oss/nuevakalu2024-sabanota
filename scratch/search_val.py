import sqlite3

db_path = "instance/kalu_master.db"

def search_value():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    tables_to_search = [
        ("movimientos_productores", ["debe", "haber", "monto_usd", "saldo_momento", "descripcion"]),
        ("ventas", ["total_usd", "saldo_pendiente_usd", "pago_efectivo_usd"]),
        ("historial_pagos", ["monto_usd"]),
        ("cuentas_por_pagar", ["monto_total_usd", "monto_abonado_usd", "saldo_pendiente_usd"]),
        ("clientes", ["saldo_usd"]),
        ("proveedores", ["saldo_pendiente_usd"])
    ]
    
    target = 29.34
    tolerance = 0.01
    
    print("=== SEARCHING FOR VALUE ~29.34 ===")
    for table, columns in tables_to_search:
        for col in columns:
            if col == "descripcion":
                c.execute(f"SELECT id, descripcion FROM {table} WHERE descripcion LIKE '%29.34%' OR descripcion LIKE '%29,34%'")
                rows = c.fetchall()
                if rows:
                    print(f"Table: {table}, Column: {col}")
                    for row in rows:
                        print(f"  Row: {row}")
            else:
                c.execute(f"SELECT * FROM {table} WHERE abs({col} - ?) <= ?", (target, tolerance))
                rows = c.fetchall()
                if rows:
                    print(f"Table: {table}, Column: {col} has matches:")
                    for row in rows:
                        print(f"  {row}")

    print("\n=== SEARCHING FOR ALL MOVEMENTS OF BOTH ANDRES ===")
    # Let's print all movements of andres eloy (ID 30) where date is around April 13, 2026
    c.execute("""
        SELECT id, debe, haber, tipo, descripcion, saldo_momento, fecha
        FROM movimientos_productores
        WHERE proveedor_id = 30 AND (fecha LIKE '2026-04-13%' OR fecha LIKE '2026-04-12%' OR fecha LIKE '2026-04-14%')
    """)
    print("Andres Eloy (ID 30) around April 13, 2026:")
    for row in c.fetchall():
        print(f"  {row}")
        
    conn.close()

if __name__ == "__main__":
    search_value()
