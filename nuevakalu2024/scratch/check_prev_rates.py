import sqlite3
import os

db_path = r'D:\nuevakalu2024\instance\kalu_master.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    date = '2026-05-05'
    print(f"--- Sales Rates for {date} ---")
    
    cursor.execute("""
        SELECT tasa_momento, COUNT(*) 
        FROM ventas 
        WHERE fecha LIKE ? 
        GROUP BY tasa_momento
    """, (f"{date}%",))
    rows = cursor.fetchall()
    for row in rows:
        print(f"Tasa: {row[0]} | Count: {row[1]}")
    
    conn.close()
else:
    print(f"Database not found at {db_path}")
