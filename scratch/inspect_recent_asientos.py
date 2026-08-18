import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("""
    SELECT id, descripcion, tasa_referencia, referencia_tipo, referencia_id, fecha
    FROM asientos
    WHERE fecha >= '2026-05-18 00:00:00'
    ORDER BY fecha DESC
""")
rows = c.fetchall()
conn.close()

print("=== Asientos since May 18 ===")
for r in rows:
    print(r)
