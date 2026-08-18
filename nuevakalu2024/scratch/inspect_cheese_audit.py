import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
conn.row_factory = sqlite3.Row
c = conn.cursor()

c.execute("""
    SELECT * FROM auditoria_inventario 
    WHERE accion = 'RECEPCION_QUESO' AND fecha >= '2026-05-15'
    ORDER BY id DESC
""")
print("=== RECEPCION_QUESO IN AUDITORIA (since May 15) ===")
for r in c.fetchall():
    print(dict(r))

conn.close()
