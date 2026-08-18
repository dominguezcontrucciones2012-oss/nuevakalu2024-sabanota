import os
import shutil
import sqlite3
from datetime import datetime

DB_PATH = 'instance/kalu_master.db'
BACKUP_PATH = f'instance/kalu_master_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.db'

# 1. Crear Backup
shutil.copy2(DB_PATH, BACKUP_PATH)
print(f"Backup creado exitosamente: {BACKUP_PATH}")

# 2. Conectar a la DB y Limpiar
conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

tablas_a_limpiar = [
    'ventas', 'detalles_ventas', 'historial_pagos', 'pagos_reportados',
    'compras', 'compras_detalles', 'cierres_caja', 'asientos', 'detalles_asientos',
    'liquidaciones_ciudad', 'movimientos_productores', 'pagos_productor',
    'cuentas_por_pagar', 'abonos_cuentas_por_pagar', 'auditoria_inventario',
    'movimientos_caja', 'pedidos', 'detalles_pedidos', 'ventas_pausadas',
    'detalles_ventas_pausadas'
]

try:
    for tabla in tablas_a_limpiar:
        try:
            c.execute(f"DELETE FROM {tabla}")
            print(f"Tabla {tabla} limpiada.")
        except Exception as ex:
            print(f"Tabla {tabla} no existe o error: {ex}")
        
        try:
            c.execute(f"DELETE FROM sqlite_sequence WHERE name='{tabla}'")
        except:
            pass

    # 3. Resetear Saldos de Clientes y Proveedores
    c.execute("UPDATE clientes SET saldo_usd = 0, saldo_bs = 0")
    print("Saldos de clientes reseteados a 0.")
    
    c.execute("UPDATE proveedores SET saldo_pendiente_usd = 0")
    print("Saldos de proveedores reseteados a 0.")

    # 4. Confirmar cambios
    conn.commit()
    print("Base de datos restaurada a estado de fabrica (solo clientes, usuarios e inventario).")
except Exception as e:
    conn.rollback()
    print(f"Error durante la limpieza: {e}")
finally:
    conn.close()
