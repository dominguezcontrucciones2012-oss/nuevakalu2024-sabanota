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

print("=== SEARCHING FOR 19.8 KG OR 83.16 USD ===")
for db in dbs:
    if not os.path.exists(db):
        continue
    conn = sqlite3.connect(db)
    c = conn.cursor()
    
    # 1. Search MovimientoProductor
    c.execute("""
        SELECT id, proveedor_id, fecha, tipo, kilos, haber, debe, descripcion
        FROM movimientos_productores
        WHERE kilos = 19.8 OR kilos LIKE '%19.8%' OR haber = 83.16 OR debe = 83.16 OR descripcion LIKE '%19.8%' OR descripcion LIKE '%83.16%'
    """)
    movs = c.fetchall()
    if movs:
        print(f"\n[MP] DB: {db}")
        for m in movs:
            print(f"  {m}")
            
    # 2. Search AuditoriaInventario
    # check if table exists
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_inventario'")
    if c.fetchone():
        c.execute("""
            SELECT id, usuario_nombre, producto_nombre, accion, cantidad_antes, cantidad_despues, fecha
            FROM auditoria_inventario
            WHERE (cantidad_despues - cantidad_antes) = 19.8 OR (cantidad_antes - cantidad_despues) = 19.8
               OR producto_nombre LIKE '%19.8%' OR usuario_nombre LIKE '%19.8%'
        """)
        auds = c.fetchall()
        if auds:
            print(f"\n[AUD] DB: {db}")
            for a in auds:
                print(f"  {a}")
                
    # 3. Search Asientos
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='asientos'")
    if c.fetchone():
        c.execute("""
            SELECT id, descripcion, tasa_referencia, referencia_tipo, referencia_id, fecha
            FROM asientos
            WHERE descripcion LIKE '%19.8%' OR descripcion LIKE '%83.16%' OR descripcion LIKE '%Tonco%'
        """)
        asientos = c.fetchall()
        if asientos:
            print(f"\n[ASI] DB: {db}")
            for a in asientos:
                print(f"  {a}")
                
    conn.close()
print("\nDone searching.")
