import sqlite3

def print_provs(db_path, label):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT id, nombre FROM proveedores ORDER BY id")
    print(f"\n=== Providers in {label} ({db_path}) ===")
    for row in c.fetchall():
        print(f"ID: {row[0]} | Nombre: {row[1]}")
    conn.close()

print_provs("instance/kalu_master.db", "CURRENT DB")
print_provs("backups/respaldo_kalu_2026-05-20_02-58-16.db", "BACKUP DB (May 20)")
