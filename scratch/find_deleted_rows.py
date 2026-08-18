import sys
import os
import sqlite3

current_db = "instance/kalu_master.db"
backups = [
    "backups/respaldo_kalu_2026-05-20_02-58-16.db",
    "backups/respaldo_kalu_2026-05-19_01-11-31.db",
]

def count_and_max(db_path):
    if not os.path.exists(db_path):
        return None
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*), MAX(id) FROM movimientos_productores")
    count, max_id = cursor.fetchone()
    conn.close()
    return count, max_id

print("Current DB count & max ID:", count_and_max(current_db))
for b in backups:
    print(f"Backup {b} count & max ID:", count_and_max(b))

# Let's list all providers with "andres" or "tonco"
conn = sqlite3.connect(current_db)
c = conn.cursor()
c.execute("SELECT id, nombre, es_productor, es_obrero FROM proveedores WHERE nombre LIKE '%andres%' OR nombre LIKE '%tonco%'")
print("\nProviders matching 'andres' or 'tonco':")
for row in c.fetchall():
    print(row)

# Let's list all movements of type 'ENTREGA_QUESO' on May 19 or 20, 2026 in the current DB and backups
def list_queso_deliveries(db_path, label):
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("""
        SELECT m.id, m.proveedor_id, p.nombre, m.fecha, m.kilos, m.haber, m.debe, m.descripcion 
        FROM movimientos_productores m
        LEFT JOIN proveedores p ON m.proveedor_id = p.id
        WHERE m.tipo = 'ENTREGA_QUESO' AND m.fecha >= '2026-05-18 00:00:00'
        ORDER BY m.id DESC
    """)
    print(f"\n=== {label} - ENTREGA_QUESO (since May 18) ===")
    for row in c.fetchall():
        print(row)
    conn.close()

list_queso_deliveries(current_db, "CURRENT DB")
list_queso_deliveries("backups/respaldo_kalu_2026-05-20_02-58-16.db", "BACKUP DB (May 20 02:58 AM)")
list_queso_deliveries("backups/respaldo_kalu_2026-05-19_01-11-31.db", "BACKUP DB (May 19 01:11 AM)")
