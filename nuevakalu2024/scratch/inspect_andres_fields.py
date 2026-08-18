import sqlite3

def inspect_fields():
    conn = sqlite3.connect("instance/kalu_master.db")
    c = conn.cursor()
    
    # Get column names
    c.execute("PRAGMA table_info(movimientos_productores)")
    cols = [col[1] for col in c.fetchall()]
    
    c.execute("""
        SELECT *
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY fecha DESC, id DESC
        LIMIT 20
    """)
    rows = c.fetchall()
    conn.close()
    
    print("Columns:", cols)
    print("-" * 120)
    for r in rows:
        print({col: val for col, val in zip(cols, r)})

if __name__ == '__main__':
    inspect_fields()
