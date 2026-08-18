import sqlite3
import json

conn = sqlite3.connect('db_memoria.db')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

def get_table(name):
    cursor.execute(f"SELECT * FROM {name}")
    return [dict(row) for row in cursor.fetchall()]

data = {
    'productos': get_table('productos'),
    'clientes': get_table('clientes'),
    'proveedores': get_table('proveedores'),
    'movimientos_caja': get_table('movimientos_caja')
}

with open('db_dump.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Exported to db_dump.json")
