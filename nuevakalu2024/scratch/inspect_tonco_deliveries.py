import sqlite3
import os

dbs = [
    "instance/kalu_master.db",
    "backups/respaldo_kalu_2026-05-20_02-58-16.db",
    "backups/respaldo_kalu_2026-05-19_01-11-31.db",
    "backups/respaldo_kalu_2026-05-16_22-39-16.db",
    "backups/respaldo_kalu_2026-05-16_22-33-31.db",
    "backups/respaldo_kalu_2026-05-11_01-31-53.db",
    "backups/respaldo_kalu_2026-05-04_02-53-04.db",
]

for db in dbs:
    if not os.path.exists(db):
        continue
    conn = sqlite3.connect(db)
    c = conn.cursor()
    # Check Proveedor ID for Tonco
    c.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE nombre LIKE '%tonco%' OR id = 5")
    prov_res = c.fetchall()
    for prov in prov_res:
        p_id = prov[0]
        p_name = prov[1]
        p_saldo = prov[2]
        c.execute("""
            SELECT id, fecha, tipo, kilos, haber, debe, saldo_momento, descripcion
            FROM movimientos_productores
            WHERE proveedor_id = ? AND (tipo LIKE '%QUESO%' OR descripcion LIKE '%queso%' OR tipo = 'ENTREGA_QUESO')
            ORDER BY fecha DESC
        """, (p_id,))
        movs = c.fetchall()
        print(f"DB: {db} | Prov: {p_name} (ID {p_id}) | Saldo Pendiente: {p_saldo} | Total Deliveries: {len(movs)}")
        for m in movs[:5]:
            print(f"  ID: {m[0]} | Date: {m[1]} | Type: {m[2]} | Kilos: {m[3]} | Haber: {m[4]} | Debe: {m[5]} | Saldo: {m[6]} | Desc: {m[7]}")
    conn.close()
    print("-" * 80)
