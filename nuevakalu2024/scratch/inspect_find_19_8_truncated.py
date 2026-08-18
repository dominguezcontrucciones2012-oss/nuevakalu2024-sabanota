import sqlite3
import os

dbs = [
    "instance/kalu_master.db",
    "backups/respaldo_kalu_2026-05-20_02-58-16.db",
    "backups/respaldo_kalu_2026-05-19_01-11-31.db",
]

for db in dbs:
    if not os.path.exists(db):
        continue
    conn = sqlite3.connect(db)
    c = conn.cursor()
    
    # 1. Search MovimientoProductor for 19.8 or 83.16 or anything related
    c.execute("""
        SELECT id, proveedor_id, fecha, tipo, kilos, haber, debe, descripcion
        FROM movimientos_productores
        WHERE kilos BETWEEN 19.0 AND 20.0 OR haber = 83.16 OR debe = 83.16 OR descripcion LIKE '%19.8%' OR descripcion LIKE '%83.16%'
    """)
    movs = c.fetchall()
    if movs:
        print(f"=== [MP] DB: {db} ===")
        for m in movs:
            print(f"  {m}")
            
    # 2. Search AuditoriaInventario
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_inventario'")
    if c.fetchone():
        c.execute("""
            SELECT id, usuario_nombre, producto_nombre, accion, cantidad_antes, cantidad_despues, fecha
            FROM auditoria_inventario
            WHERE abs((cantidad_despues - cantidad_antes) - 19.8) < 0.1
        """)
        auds = c.fetchall()
        if auds:
            print(f"=== [AUD] DB: {db} ===")
            for a in auds:
                print(f"  {a}")
    conn.close()
