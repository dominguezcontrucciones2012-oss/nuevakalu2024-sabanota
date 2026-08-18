import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
conn.row_factory = sqlite3.Row
c = conn.cursor()
c.execute("SELECT * FROM users WHERE username = '31107381'")
u = c.fetchone()
if u:
    print("User 31107381:")
    print(dict(u))
else:
    print("User 31107381 not found")
    
c.execute("SELECT * FROM proveedores WHERE id = (SELECT proveedor_id FROM users WHERE username = '31107381')")
p = c.fetchone()
if p:
    print("Linked supplier:")
    print(dict(p))
else:
    print("No linked supplier for 31107381")
conn.close()
