import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("SELECT * FROM movimientos_productores WHERE id IN (1281, 1282)")
print("Rows 1281 and 1282:")
for row in c.fetchall():
    print(row)
conn.close()
