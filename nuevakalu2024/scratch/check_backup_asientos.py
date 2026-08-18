import sqlite3

conn = sqlite3.connect("backups/respaldo_kalu_2026-05-20_02-58-16.db")
c = conn.cursor()
c.execute("SELECT id, descripcion, fecha FROM asientos WHERE fecha >= '2026-05-19 00:00:00'")
print(c.fetchall())
conn.close()
