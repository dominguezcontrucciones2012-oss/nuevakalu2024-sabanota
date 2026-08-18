import sqlite3
import os

current_db = "instance/kalu_master.db"
backup_db = "backups/respaldo_kalu_2026-05-20_02-58-16.db"

def inspect_db(db_path, label):
    if not os.path.exists(db_path):
        print(f"{label} does not exist: {db_path}")
        return
    print(f"\n=== {label} ({db_path}) ===")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Let's see if there are tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [t[0] for t in cursor.fetchall()]
    
    if 'movimientos_productores' in tables:
        # Query movements for Tonco (proveedor_id = 5)
        cursor.execute("""
            SELECT id, fecha, tipo, descripcion, kilos, debe, haber, saldo_momento 
            FROM movimientos_productores 
            WHERE proveedor_id = 5
            ORDER BY id DESC LIMIT 15
        """)
        rows = cursor.fetchall()
        print("Tonco Martinez (ID 5) movements:")
        for r in rows:
            print(f"  ID: {r[0]} | Fecha: {r[1]} | Tipo: {r[2]} | Desc: {r[3]} | Kilos: {r[4]} | Debe: {r[5]} | Haber: {r[6]} | Saldo: {r[7]}")
            
        # Query recently added movements in general
        cursor.execute("""
            SELECT id, proveedor_id, fecha, tipo, descripcion, kilos, debe, haber, saldo_momento 
            FROM movimientos_productores 
            ORDER BY id DESC LIMIT 15
        """)
        rows_all = cursor.fetchall()
        print("\nAll recent movements:")
        for r in rows_all:
            print(f"  ID: {r[0]} | Prov: {r[1]} | Fecha: {r[2]} | Tipo: {r[3]} | Desc: {r[4]} | Kilos: {r[5]} | Debe: {r[6]} | Haber: {r[7]} | Saldo: {r[8]}")
    else:
        print("movimientos_productores table not found!")
    conn.close()

inspect_db(current_db, "CURRENT DB")
inspect_db(backup_db, "BACKUP DB (May 20 02:58 AM)")
inspect_db("backups/respaldo_kalu_2026-05-19_01-11-31.db", "BACKUP DB (May 19 01:11 AM)")
