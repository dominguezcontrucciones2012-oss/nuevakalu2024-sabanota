import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("SELECT codigo, nombre FROM cuentas_contables ORDER BY codigo ASC")
rows = c.fetchall()
conn.close()

print("=== Chart of Accounts ===")
for r in rows:
    print(r)
