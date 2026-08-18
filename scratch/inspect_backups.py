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
        print(f"CONSULTANDO RESPALDO: {b}")
        print(f"==========================================")
        try:
            conn = sqlite3.connect(path)
            cursor = conn.cursor()
            
            # Consultar IDs 452 y 453
            cursor.execute("SELECT * FROM movimientos_productores WHERE id IN (452, 453)")
            rows = cursor.fetchall()
            
            # Obtener nombres de columnas
            cursor.execute("PRAGMA table_info(movimientos_productores)")
            cols = [c[1] for c in cursor.fetchall()]
            
            print(f"Resultados encontrados ({len(rows)}):")
            for r in rows:
                row_dict = dict(zip(cols, r))
                print(f"  - ID: {row_dict.get('id')} | Proveedor ID: {row_dict.get('proveedor_id')} | Tipo: {row_dict.get('tipo')} | Debe: {row_dict.get('debe')} | Haber: {row_dict.get('haber')} | Saldo: {row_dict.get('saldo_momento')} | Desc: {row_dict.get('descripcion')} | Fecha: {row_dict.get('fecha')}")
                
            conn.close()
        except Exception as e:
            print(f"Error: {e}")
