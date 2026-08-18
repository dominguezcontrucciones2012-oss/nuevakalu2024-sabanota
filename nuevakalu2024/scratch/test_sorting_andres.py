import sqlite3

def test_sorting():
    conn = sqlite3.connect("backups/respaldo_kalu_2026-05-20_02-58-16.db")
    c = conn.cursor()
    
    # Query 1: Order by ID
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY id ASC
    """)
    rows_id = c.fetchall()
    
    # Query 2: Order by date
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY fecha ASC, id ASC
    """)
    rows_date = c.fetchall()
    
    conn.close()
    
    print("=== Testing Sort by ID ===")
    f1 = 0.0
    f2 = 0.0
    for idx, r in enumerate(rows_id):
        mid, fecha, tipo, debe, haber, db_saldo, desc = r
        d = float(debe or 0)
        h = float(haber or 0)
        
        # Standard
        f1 = f1 + h - d
        # Bugged (treating ABONO_POS as credit)
        if tipo == 'ABONO_POS':
            f2 = f2 + h + d
        else:
            f2 = f2 + h - d
            
        diff_f1 = db_saldo - f1
        diff_f2 = db_saldo - f2
        
        if abs(diff_f1) > 0.01 and abs(diff_f2) > 0.01:
            # Check if there is still a discrepancy
            pass
        else:
            # One of them matches!
            pass
            
    # Let's count how many discrepancies we have under each sorting and formula
    def count_discrepancies(rows, order_name):
        for name, treat_abono_as_credit in [("Standard", False), ("ABONO_POS as Credit", True)]:
            calc = 0.0
            discrepancies = 0
            for r in rows:
                mid, fecha, tipo, debe, haber, db_saldo, desc = r
                d = float(debe or 0)
                h = float(haber or 0)
                
                if tipo == 'ABONO_POS' and treat_abono_as_credit:
                    calc = calc + h + d
                else:
                    calc = calc + h - d
                    
                if abs(db_saldo - calc) > 0.01:
                    discrepancies += 1
            print(f"Order: {order_name:10s} | Formula: {name:20s} | Discrepancies: {discrepancies}")

    count_discrepancies(rows_id, "ID ASC")
    count_discrepancies(rows_date, "Date, ID")

if __name__ == '__main__':
    test_sorting()
