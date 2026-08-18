import sqlite3

db_path = "instance/kalu_master.db"

# Connect to DB
conn = sqlite3.connect(db_path)
c = conn.cursor()

# 1. Flip wrong abonos (move from debe to haber, set debe = 0)
wrong_abonos_map = {
    2: [49, 50],       # Negra Corcovado
    3: [101, 268],     # Pedrito Corcovado
    6: [490],          # Luis Corro
    8: [44],           # Luis Miguel Camoruco
    9: [542],          # Vicente Osto
    19: [76, 81],      # Andres Corro
    25: [479],         # Gustavito
    26: [106, 107],    # Coa Miranda
    31: [297, 433, 446, 516] # Diana Aponte
}

print("Flipping wrong abonos...")
for pid, ids in wrong_abonos_map.items():
    for tx_id in ids:
        c.execute("SELECT debe, descripcion FROM movimientos_productores WHERE id = ?", (tx_id,))
        res = c.fetchone()
        if res:
            debe, desc = res
            new_desc = f"[CORREGIDO SIGNOS] {desc}" if not desc.startswith("[CORREGIDO SIGNOS]") else desc
            c.execute("""
                UPDATE movimientos_productores
                SET debe = 0.0, haber = ?, descripcion = ?
                WHERE id = ?
            """, (debe, new_desc, tx_id))
            print(f"  Flipped Tx ID {tx_id} for Supplier ID {pid}: Debe {debe} -> Haber {debe}")

# 2. Insert adjustments for overridden producers
adj_date = "2026-05-21 13:50:00"
adjustments = [
    (2, 25.37, 0.00, "Ajuste de conciliacion de saldo solicitado por usuario"),
    (9, 14.10, 0.00, "Ajuste de conciliacion de saldo solicitado por usuario"),
    (31, 37.02, 0.00, "Ajuste de conciliacion de saldo solicitado por usuario"),
    (36, 0.00, 86.04, "Ajuste de conciliacion de saldo solicitado por usuario"),
    (25, 6.50, 0.00, "Ajuste de conciliacion de saldo solicitado por usuario")
]

print("\nInserting adjustments...")
for pid, debe, haber, desc in adjustments:
    # Check if this adjustment has already been inserted (avoid duplication on re-run)
    c.execute("""
        SELECT id FROM movimientos_productores 
        WHERE proveedor_id = ? AND tipo = 'AJUSTE' AND debe = ? AND haber = ? AND descripcion = ?
    """, (pid, debe, haber, desc))
    if c.fetchone():
        print(f"  Adjustment already exists for Supplier ID {pid}, skipping.")
        continue
        
    c.execute("""
        INSERT INTO movimientos_productores (proveedor_id, fecha, tipo, debe, haber, saldo_momento, descripcion)
        VALUES (?, ?, 'AJUSTE', ?, ?, 0.0, ?)
    """, (pid, adj_date, debe, haber, desc))
    print(f"  Inserted adjustment for Supplier ID {pid}: Debe {debe}, Haber {haber}")

# 3. Recalculate running balance (saldo_momento) for all affected/reviewed producers
all_requested_ids = [2, 3, 6, 7, 8, 9, 19, 24, 25, 26, 29, 31, 32, 36]

print("\nRecalculating balances...")
for pid in all_requested_ids:
    c.execute("""
        SELECT id, debe, haber
        FROM movimientos_productores
        WHERE proveedor_id = ?
        ORDER BY fecha ASC, id ASC
    """, (pid,))
    movs = c.fetchall()
    
    running = 0.0
    for mid, debe, haber in movs:
        debe = float(debe or 0.0)
        haber = float(haber or 0.0)
        running = running + haber - debe
        c.execute("""
            UPDATE movimientos_productores
            SET saldo_momento = ?
            WHERE id = ?
        """, (running, mid))
        
    # Update proveedores table
    c.execute("""
        UPDATE proveedores
        SET saldo_pendiente_usd = ?
        WHERE id = ?
    """, (running, pid))
    print(f"  Recalculated Supplier ID {pid:<2}: Final Balance: {running:+.2f}")

conn.commit()
conn.close()
print("\nDatabase update completed successfully!")
