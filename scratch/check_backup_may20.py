import sqlite3

db_path = "backups/respaldo_kalu_2026-05-20_02-58-16.db"
conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute("""
    SELECT m.id, m.fecha, m.tipo, m.debe, m.haber, m.saldo_momento, m.descripcion
    FROM movimientos_productores m
    WHERE m.proveedor_id = 30 AND m.fecha >= '2026-05-15'
    ORDER BY m.fecha ASC, m.id ASC
""")
rows = c.fetchall()

print(f"=== andres eloy (ID 30) in Backup May 20 ===")
print(f"{'ID':4s} | {'Fecha':23s} | {'Tipo':10s} | {'Debe':10s} | {'Haber':10s} | {'Saldo':12s} | {'Description'}")
print("-" * 120)
for r in rows:
    print(f"{r[0]:4d} | {r[1]:23s} | {r[2]:10s} | {r[3]:10.6f} | {r[4]:10.6f} | {r[5]:12.6f} | {r[6]}")

c.execute("SELECT saldo_pendiente_usd FROM proveedores WHERE id = 30")
print(f"\nSaldo in proveedores table: {c.fetchone()[0]}")

conn.close()
