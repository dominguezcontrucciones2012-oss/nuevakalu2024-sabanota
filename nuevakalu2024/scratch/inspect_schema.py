import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = c.fetchall()
print("Tables in master DB:")
for t in tables:
    print(t[0])
    # Show columns
    c.execute(f"PRAGMA table_info({t[0]})")
    cols = c.fetchall()
    print("  Columns:", [col[1] for col in cols])

conn.close()
