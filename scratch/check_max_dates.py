import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

# Get max dates in tables
tables = ["movimientos_productores", "asientos", "auditoria_inventario"]
for t in tables:
    c.execute(f"SELECT MAX(fecha) FROM {t}")
    print(f"Max date in {t}: {c.fetchone()[0]}")
    
# check if tables exist and get count
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
all_tables = [x[0] for x in c.fetchall()]
print(f"All tables: {all_tables}")

conn.close()
