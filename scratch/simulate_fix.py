import sqlite3
import os
from decimal import Decimal

# We will connect to master and simulate the changes in a transaction, then compare with backup
conn_m = sqlite3.connect("instance/kalu_master.db")
c_m = conn_m.cursor()

conn_b = sqlite3.connect("backups/respaldo_kalu_2026-05-20_02-58-16.db")
c_b = conn_b.cursor()

# Get list of all producers
c_m.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE es_productor=1 OR es_obrero=1")
producers = c_m.fetchall()

print("=== SIMULATING BALANCES AFTER FIX ===")
print(f"{'Productor':30s} | {'Master Current':15s} | {'Simulated Fix':15s} | {'Backup Val':15s} | {'Diff':10s}")
print("-" * 95)

for p_id, p_name, p_saldo in producers:
    # Get backup balance
    c_b.execute("SELECT saldo_pendiente_usd FROM proveedores WHERE id = ?", (p_id,))
    b_res = c_b.fetchone()
    b_saldo = b_res[0] if b_res else 0.0
    
    # Get all movements for this producer from master
    c_m.execute("""
        SELECT id, fecha, tipo, debe, haber, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = ?
        ORDER BY fecha ASC, id ASC
    """, (p_id,))
    movs = [list(r) for r in c_m.fetchall()]
    
    # Apply simulated fixes on these movements
    # Fix 1: Convert ABONO_POS from debe to haber
    for m in movs:
        m_id, fecha, tipo, debe, haber, desc = m
        if tipo == 'ABONO_POS':
            if debe > 0 and haber == 0:
                m[4] = debe  # haber = debe
                m[3] = 0.0   # debe = 0
                
    # Fix 2: Insert missing deliveries for Angelito (ID 10) and Marcos Corro (ID 7)
    if p_id == 10: # Angelito
        # Check if already has it
        has_delivery = any(m[2] == 'ENTREGA_QUESO' and float(m[4]) == 124.50 for m in movs)
        if not has_delivery:
            movs.append([9999, '2026-04-11 10:00:00', 'ENTREGA_QUESO', 0.0, 124.50, '[AUDITORIA] Entrega de Queso 24.9kg'])
            # Re-sort by date and id
            movs.sort(key=lambda x: (x[1], x[0]))
            
    if p_id == 7: # Marcos Corro
        has_delivery = any(m[2] == 'ENTREGA_QUESO' and float(m[4]) == 124.50 for m in movs)
        if not has_delivery:
            movs.append([9998, '2026-04-10 10:00:00', 'ENTREGA_QUESO', 0.0, 124.50, '[AUDITORIA] Entrega de Queso 24.9kg'])
            movs.sort(key=lambda x: (x[1], x[0]))
            
    # Recalculate
    running = 0.0
    for m in movs:
        debe = float(m[3] or 0.0)
        haber = float(m[4] or 0.0)
        running = running + haber - debe
        
    diff = running - b_saldo
    print(f"{p_name:30s} | {p_saldo:15.2f} | {running:15.2f} | {b_saldo:15.2f} | {diff:10.2f}")

conn_m.close()
conn_b.close()
