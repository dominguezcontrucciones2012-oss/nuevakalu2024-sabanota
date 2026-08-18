import sqlite3
import os

dbs = [
    "admin_desktop/dev.db",
    "admin_desktop/prisma/dev.db",
    "admin_desktop/prisma/prisma/dev.db",
]

print("=== SEARCHING IN DESKTOP DBS FOR 19.8 OR 83.16 ===")
for db in dbs:
    if not os.path.exists(db):
        continue
    print(f"\nChecking DB: {db}")
    conn = sqlite3.connect(db)
    c = conn.cursor()
    
    # List tables
    c.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [x[0] for x in c.fetchall()]
    
    # For each table, search for 19.8 or 83.16
    for t in tables:
        # get columns
        c.execute(f'PRAGMA table_info("{t}")')
        cols = [x[1] for x in c.fetchall()]
        
        for col in cols:
            try:
                c.execute(f'SELECT * FROM "{t}" WHERE "{col}" = 19.8 OR "{col}" = 83.16 OR "{col}" LIKE \'%19.8%\' OR "{col}" LIKE \'%83.16%\'')
                res = c.fetchall()
                if res:
                    print(f"    Match in table {t}, column {col}:")
                    for row in res:
                        print(f"      {row}")
            except Exception as e:
                pass
    conn.close()
print("\nDone searching desktop DBs.")
