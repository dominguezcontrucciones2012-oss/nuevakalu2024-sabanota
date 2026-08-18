import sqlite3
import os

db_files = [
    "instance/kalu_master.db",
    "instance/kalu_master.db.pre-restore",
    "instance/kalu_master.db.pre-restore-2",
    "instance/kalu_master_sim_test.db",
    "backups/before_repairs_2026-05-20_23-53-58.db"
]

for db in db_files:
    if not os.path.exists(db):
        print(f"{db} does not exist")
        continue
    conn = sqlite3.connect(db)
    c = conn.cursor()
    # Check Negra Corcovado
    c.execute("SELECT nombre, saldo_pendiente_usd FROM proveedores WHERE id = 2")
    prov = c.fetchone()
    # Check movimentos for Negra Corcovado
    c.execute("SELECT id, debe, haber, saldo_momento, descripcion FROM movimientos_productores WHERE proveedor_id = 2")
    movs = c.fetchall()
    print(f"\n--- {db} ---")
    print(f"Proveedor: {prov}")
    print("Movimientos:")
    for m in movs:
        print(f"  {m}")
    conn.close()
