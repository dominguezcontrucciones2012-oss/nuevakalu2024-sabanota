import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("PRAGMA table_info(auditoria_inventario)")
for x in c.fetchall():
    print(x)
conn.close()
