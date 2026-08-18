import sqlite3
db_path = r'D:\nuevakalu2024\instance\kalu_master.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT id, total_ventas_usd FROM cierres_caja WHERE date(fecha) = '2026-05-06'")
print(cursor.fetchall())
conn.close()
