import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("""
    SELECT codigo, nombre FROM cuentas_contables
    WHERE codigo LIKE '5.%' OR codigo LIKE '6.%' OR nombre LIKE '%GASTO%' OR nombre LIKE '%PREMIO%' OR nombre LIKE '%PROMO%'
    ORDER BY codigo ASC
""")
rows = c.fetchall()
conn.close()

print("=== Expense / Promo Accounts ===")
for r in rows:
    print(r)
