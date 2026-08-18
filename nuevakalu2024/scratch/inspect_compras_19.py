import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("SELECT * FROM compras WHERE fecha LIKE '2026-05-19%' OR fecha >= '2026-05-19 00:00:00'")
print("=== Compras on May 19 or 20 ===")
for r in c.fetchall():
    print(r)
    
c.execute("SELECT * FROM cuentas_por_pagar WHERE fecha LIKE '2026-05-19%' OR fecha >= '2026-05-19 00:00:00'")
print("\n=== CXP on May 19 or 20 ===")
for r in c.fetchall():
    print(r)
conn.close()
