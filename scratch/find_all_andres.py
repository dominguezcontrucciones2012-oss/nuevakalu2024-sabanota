import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

c.execute("SELECT id, nombre, rif, saldo_pendiente_usd, es_productor, es_obrero FROM proveedores WHERE nombre LIKE '%andre%' OR nombre LIKE '%corro%' OR nombre LIKE '%eloy%'")
print("=== Matches ===")
for r in c.fetchall():
    print(r)

conn.close()
