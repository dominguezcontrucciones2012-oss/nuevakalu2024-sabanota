import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

def print_last_5(prov_id, name):
    print(f"=== {name} (ID {prov_id}) ===")
    c.execute("""
        SELECT m.id, m.fecha, m.tipo, m.descripcion, m.kilos, m.debe, m.haber, m.saldo_momento
        FROM movimientos_productores m
        WHERE m.proveedor_id = ?
        ORDER BY m.id DESC LIMIT 5
    """, (prov_id,))
    for r in c.fetchall():
        print(f"  ID: {r[0]} | Fecha: {r[1]} | Tipo: {r[2]} | Desc: {r[3]} | Kilos: {r[4]} | Debe: {r[5]} | Haber: {r[6]} | Saldo: {r[7]}")

print_last_5(19, "ANDRES CORRO")
print_last_5(30, "andres eloy")
conn.close()
