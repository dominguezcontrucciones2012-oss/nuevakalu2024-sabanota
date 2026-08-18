import sqlite3
import os

db_path = r'D:\nuevakalu2024\instance\kalu_master.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    sale_id = 2313
    print(f"--- Full Info for Sale ID: {sale_id} ---")
    
    cursor.execute("PRAGMA table_info(ventas)")
    columns = [col[1] for col in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM ventas WHERE id = ?", (sale_id,))
    row = cursor.fetchone()
    
    for col, val in zip(columns, row):
        print(f"{col}: {val}")
    
    conn.close()
else:
    print(f"Database not found at {db_path}")
