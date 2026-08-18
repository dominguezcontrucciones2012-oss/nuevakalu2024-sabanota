import sqlite3

def run_simulation():
    conn = sqlite3.connect("instance/kalu_master.db")
    c = conn.cursor()
    
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY fecha ASC, id ASC
    """)
    rows = [list(r) for r in c.fetchall()]
    conn.close()

    print("Total transactions:", len(rows))
    
    # We want to see what combinations of fixing these three ABONO_POS entries:
    # ID 443 (4.21), ID 515 (160.00), ID 526 (2.00)
    # yield the final balance of -29.34.
    # Note: we also want to print the final balance if we only fix the 13/04/2026 ones (515 and 526).
    
    targets = [515, 526, 443]
    
    from itertools import product
    # Each can be either 'fixed' (debe -> haber) or 'original' (keeps current columns)
    for fix_443, fix_515, fix_526 in product([False, True], repeat=3):
        # Apply the logic
        running = 0.0
        for r in rows:
            mid, fecha, tipo, debe, haber, desc = r
            d = float(debe or 0)
            h = float(haber or 0)
            
            # Apply simulated fix
            if mid == 443 and fix_443:
                h = d
                d = 0.0
            elif mid == 515 and fix_515:
                h = d
                d = 0.0
            elif mid == 526 and fix_526:
                h = d
                d = 0.0
                
            running = running + h - d
            
        print(f"Fix 443: {fix_443!s:5s} | Fix 515: {fix_515!s:5s} | Fix 526: {fix_526!s:5s} => Final Balance: {running:10.4f}")

if __name__ == '__main__':
    run_simulation()
