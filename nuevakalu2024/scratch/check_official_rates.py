import sqlite3
import os

db_path = r'D:\nuevakalu2024\instance\kalu_master.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("--- Official Rates (TasaBCV) ---")
    cursor.execute("SELECT * FROM tasas_bcv ORDER BY fecha DESC LIMIT 5")
    rows = cursor.fetchall()
    for row in rows:
        print(row)
    
    conn.close()
else:
    print(f"Database not found at {db_path}")
