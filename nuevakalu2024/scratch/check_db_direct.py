import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'instance', 'kalu_master.db')
print("Connecting to:", db_path)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT nombre, costo_usd, precio_oferta_usd FROM productos WHERE nombre LIKE '%yusty%';")
    rows = cursor.fetchall()
    print("Found products:")
    for row in rows:
        print(f"Nombre: {row[0]} | Costo: {row[1]} | Precio Oferta: {row[2]}")
    conn.close()
except Exception as e:
    print("Error:", e)
