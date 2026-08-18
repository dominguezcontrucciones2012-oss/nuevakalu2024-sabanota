import sqlite3

db_path = "instance/kalu_master.db"
conn = sqlite3.connect(db_path)
c = conn.cursor()

# 1. Get current balance of Marcos Corro (ID 7)
c.execute("SELECT saldo_pendiente_usd FROM proveedores WHERE id = 7")
curr_balance = float(c.fetchone()[0])
print(f"Current Marcos Corro balance: {curr_balance}")

# Target balance: -166.53 (he owes 166.53)
target_balance = -166.53
diff = target_balance - curr_balance
print(f"Difference: {diff}")

if abs(diff) > 0.001:
    debe = 0.0
    haber = 0.0
    if diff > 0:
        haber = diff
    else:
        debe = -diff
        
    desc = "Ajuste de conciliacion de saldo solicitado por usuario"
    adj_date = "2026-05-21 17:18:00"
    
    # Check if this adjustment has already been inserted to avoid duplicates
    c.execute("""
        SELECT id FROM movimientos_productores 
        WHERE proveedor_id = 7 AND tipo = 'AJUSTE' AND debe = ? AND haber = ? AND descripcion = ?
    """, (debe, haber, desc))
    
    if c.fetchone():
        print("Adjustment already exists, skipping insert.")
    else:
        c.execute("""
            INSERT INTO movimientos_productores (proveedor_id, fecha, tipo, debe, haber, saldo_momento, descripcion)
            VALUES (7, ?, 'AJUSTE', ?, ?, 0.0, ?)
        """, (adj_date, debe, haber, desc))
        print(f"Inserted adjustment: Debe {debe:.4f}, Haber {haber:.4f}")
        
    # Recalculate running balance
    c.execute("""
        SELECT id, debe, haber
        FROM movimientos_productores
        WHERE proveedor_id = 7
        ORDER BY fecha ASC, id ASC
    """)
    movs = c.fetchall()
    
    running = 0.0
    for mid, d, h in movs:
        d = float(d or 0.0)
        h = float(h or 0.0)
        running = running + h - d
        c.execute("""
            UPDATE movimientos_productores
            SET saldo_momento = ?
            WHERE id = ?
        """, (running, mid))
        
    c.execute("""
        UPDATE proveedores
        SET saldo_pendiente_usd = ?
        WHERE id = 7
    """, (running,))
    print(f"Recalculated final balance: {running:.4f}")
    
    conn.commit()
    print("Changes committed successfully!")
else:
    print("No adjustment needed.")

conn.close()
