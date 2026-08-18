import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("""
    SELECT a.id, a.descripcion, a.tasa_referencia, a.referencia_tipo, a.referencia_id, a.fecha
    FROM asientos a
    WHERE a.referencia_tipo = 'COMPRA_QUESO' AND a.referencia_id = 40
    ORDER BY a.id DESC LIMIT 1
""")
asiento = c.fetchone()
print("Asiento:")
print(asiento)

if asiento:
    c.execute("""
        SELECT d.id, c.codigo, c.nombre, d.debe_usd, d.haber_usd, d.debe_bs, d.haber_bs
        FROM detalles_asientos d
        LEFT JOIN cuentas_contables c ON d.cuenta_id = c.id
        WHERE d.asiento_id = ?
    """, (asiento[0],))
    print("\nDetalleAsiento:")
    for d in c.fetchall():
        print(d)
conn.close()
