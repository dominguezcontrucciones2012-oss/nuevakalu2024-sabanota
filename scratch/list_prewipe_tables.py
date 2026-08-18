import sqlite3

def list_tables():
    db = "backups/respaldo_kalu_AUTO_PRE_WIPE_2026-04-29_10-32-34.db"
    conn = sqlite3.connect(db)
    c = conn.cursor()
    c.execute("SELECT name FROM sqlite_master WHERE type='table'")
    print("Tables:", [r[0] for r in c.fetchall()])
    conn.close()

if __name__ == '__main__':
    list_tables()
