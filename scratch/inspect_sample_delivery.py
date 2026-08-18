import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("""
    SELECT * FROM movimientos_productores
    WHERE tipo = 'ENTREGA_QUESO'
    ORDER BY id DESC LIMIT 1
""")
row = c.fetchone()
print("Columns info:")
c.execute("PRAGMA table_info(movimientos_productores)")
cols = [x[1] for x in c.fetchall()]
for col, val in zip(cols, row):
    print(f"  {col}: {val}")
conn.close()
