import sqlite3
import os

db_path = r'D:\nuevakalu2024\instance\kalu_master.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT count(*) FROM ventas WHERE fecha >= '2026-04-22 13:00:00'")
    count = cursor.fetchone()[0]
    print(f"Sales after 1:00 PM on April 22nd: {count}")
    
    cursor.execute("SELECT id, fecha, total_usd FROM ventas WHERE fecha >= '2026-04-22 13:00:00' LIMIT 5")
    rows = cursor.fetchall()
    for row in rows:
        print(row)
    
    conn.close()
else:
    print("Database not found localy.")
