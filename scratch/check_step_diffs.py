import sqlite3

def check_step_diffs():
    conn = sqlite3.connect("backups/respaldo_kalu_2026-05-20_02-58-16.db")
    c = conn.cursor()
    
    # Sort by ID
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY id ASC
    """)
    rows_id = c.fetchall()
    
    # Sort by Date
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY fecha ASC, id ASC
    """)
    rows_date = c.fetchall()
    conn.close()
    
    def count_step_anomalies(rows, order_name):
        for name, treat_abono_as_credit in [("Standard", False), ("ABONO_POS as Credit", True)]:
            step_anomalies = []
            prev_db_saldo = 0.0
            for idx, r in enumerate(rows):
                mid, fecha, tipo, debe, haber, db_saldo, desc = r
                d = float(debe or 0)
                h = float(haber or 0)
                db_saldo = float(db_saldo or 0)
                
                if tipo == 'ABONO_POS' and treat_abono_as_credit:
                    expected = h + d
                else:
                    expected = h - d
                    
                diff = db_saldo - prev_db_saldo
                if abs(diff - expected) > 0.01:
                    step_anomalies.append((mid, diff, expected))
                prev_db_saldo = db_saldo
            print(f"Order: {order_name:10s} | Formula: {name:20s} | Step Anomalies: {len(step_anomalies)}")
            if len(step_anomalies) < 15:
                print("  IDs of anomalies:", [x[0] for x in step_anomalies])

    count_step_anomalies(rows_id, "ID ASC")
    print("-" * 60)
    count_step_anomalies(rows_date, "Date, ID")

if __name__ == '__main__':
    check_step_diffs()
