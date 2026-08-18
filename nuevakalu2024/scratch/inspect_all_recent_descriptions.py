import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

print("=== ALL MOVEMENTS SINCE MAY 18 ===")
c.execute("""
    SELECT m.id, m.proveedor_id, m.fecha, m.tipo, m.descripcion, m.kilos, m.debe, m.haber, m.saldo_momento
    FROM movimientos_productores m
    WHERE m.fecha >= '2026-05-18'
    ORDER BY m.id DESC
""")
for r in c.fetchall():
    print(r)

print("\n=== SEARCHING ALL TABLES FOR 'TONCO' OR 'QUESO' (SINCE MAY 18) ===")
# Let's inspect all tables
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [row[0] for row in c.fetchall()]

for table in tables:
    try:
        # Check if table has a column that might contain text
        c.execute(f"PRAGMA table_info({table})")
        cols = [col[1] for col in c.fetchall()]
        text_cols = [col for col in cols if col in ['descripcion', 'nombre', 'referencia_tipo', 'numero_factura', 'concepto', 'detalles']]
        if not text_cols:
            continue
        
        # We query for rows since May 18 containing 'tonco' or 'queso'
        date_col = next((col for col in cols if col in ['fecha', 'created_at']), None)
        if not date_col:
            continue
            
        where_clauses = [f"{col} LIKE '%tonco%'" for col in text_cols] + [f"{col} LIKE '%queso%'" for col in text_cols]
        query = f"SELECT * FROM {table} WHERE ({' OR '.join(where_clauses)}) AND {date_col} >= '2026-05-18'"
        c.execute(query)
        rows = c.fetchall()
        if rows:
            print(f"\nTable {table}:")
            for r in rows:
                print(r)
    except Exception as e:
        # Ignore errors for tables without date_col or text_cols
        pass

conn.close()
