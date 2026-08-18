import sys
import os
import sqlite3

backup_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../backups'))
backups = [
    'respaldo_kalu_AUTO_PRE_WIPE_2026-04-29_10-32-34.db',
    'respaldo_kalu_2026-05-04_02-53-04.db'
]

for b in backups:
    path = os.path.join(backup_dir, b)
    if os.path.exists(path):
        print(f"\n==========================================")
        print(f"TABLAS EN: {b}")
        print(f"==========================================")
        try:
            conn = sqlite3.connect(path)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [t[0] for t in cursor.fetchall()]
            print("Tablas:", tables)
            
            # Buscar alguna tabla relacionada con movimientos o productores
            for t in tables:
                if 'movimiento' in t.lower() or 'productor' in t.lower() or 'proveedor' in t.lower():
                    cursor.execute(f"SELECT COUNT(*) FROM {t}")
                    count = cursor.fetchone()[0]
                    print(f"  - Tabla: {t} | Filas: {count}")
                    
            conn.close()
        except Exception as e:
            print(f"Error: {e}")
