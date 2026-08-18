import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()
c.execute("""
    SELECT id, cuenta_id, fecha, monto_usd, metodo_pago, descripcion
    FROM abonos_cuentas_por_pagar
    WHERE cuenta_id = 206
""")
print(c.fetchall())
conn.close()
