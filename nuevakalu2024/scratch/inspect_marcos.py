import sqlite3
conn = sqlite3.connect('instance/kalu_master.db')
cursor = conn.execute('''
    SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion 
    FROM movimientos_productores 
    WHERE proveedor_id=7 
    ORDER BY fecha ASC
''')
rows = cursor.fetchall()
conn.close()

with open('scratch/marcos_movements.txt', 'w', encoding='utf-8') as f:
    f.write(f"Total movements for Marcos Corro: {len(rows)}\n")
    for r in rows:
        f.write(f"ID: {r[0]} | Fecha: {r[1]} | Tipo: {r[2]} | Debe: {r[3]} | Haber: {r[4]} | Saldo Momento: {r[5]} | Desc: {r[6]}\n")

print(f"Written {len(rows)} movements to scratch/marcos_movements.txt")
