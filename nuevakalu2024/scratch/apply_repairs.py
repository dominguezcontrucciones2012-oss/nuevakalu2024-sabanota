import sqlite3
import shutil
import datetime
import os

db_path = "instance/kalu_master.db"
backup_dir = "backups"
os.makedirs(backup_dir, exist_ok=True)

# 1. Create a backup first
now_str = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
backup_path = f"{backup_dir}/before_repairs_{now_str}.db"
shutil.copy(db_path, backup_path)
print(f"Backup created at {backup_path}")

conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute("SELECT id, nombre, es_productor, es_obrero, saldo_pendiente_usd FROM proveedores")
providers = c.fetchall()

for pid, name, es_prod, es_obr, current_saldo in providers:
    if es_prod == 0 and es_obr == 0:
        # General Supplier
        # Delete movements if any
        c.execute("DELETE FROM movimientos_productores WHERE proveedor_id = ?", (pid,))
        deleted_movs = c.rowcount
        
        # Calculate CXP outstanding sum
        c.execute("SELECT SUM(saldo_pendiente_usd) FROM cuentas_por_pagar WHERE proveedor_id = ? AND estatus != 'Pagado'", (pid,))
        sum_cxp = c.fetchone()[0] or 0.0
        
        c.execute("UPDATE proveedores SET saldo_pendiente_usd = ? WHERE id = ?", (sum_cxp, pid))
        print(f"[GENERAL] Updated {name:<20} to saldo {sum_cxp:.2f} (deleted {deleted_movs} movements)")
    else:
        # Producer or Worker
        c.execute("SELECT id, debe, haber FROM movimientos_productores WHERE proveedor_id = ? ORDER BY fecha ASC, id ASC", (pid,))
        movs = c.fetchall()
        running = 0.0
        for mid, debe, haber in movs:
            running = running + float(haber or 0) - float(debe or 0)
            c.execute("UPDATE movimientos_productores SET saldo_momento = ? WHERE id = ?", (running, mid))
        
        c.execute("UPDATE proveedores SET saldo_pendiente_usd = ? WHERE id = ?", (running, pid))
        print(f"[PROD/WORKER] Recalculated {name:<20} to saldo {running:.2f}")

conn.commit()
conn.close()
print("All repairs applied successfully.")
