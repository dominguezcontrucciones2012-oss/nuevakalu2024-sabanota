import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

for t in ["asientos", "detalles_asientos", "compras", "cuentas_por_pagar"]:
    print(f"\nSchema for {t}:")
    c.execute(f"PRAGMA table_info({t})")
    for x in c.fetchall():
        print(f"  {x}")

conn.close()
