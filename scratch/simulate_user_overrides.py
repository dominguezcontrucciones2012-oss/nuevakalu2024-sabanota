import sqlite3
import shutil

db_original = "instance/kalu_master.db"
db_sim = "instance/kalu_master_sim_test.db"

# Copy original DB to simulation
shutil.copyfile(db_original, db_sim)

# Connect to simulation DB
conn = sqlite3.connect(db_sim)
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

for pid, ids in wrong_abonos_map.items():
    for tx_id in ids:
        # Get current debe
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

# Define target dates for adjustments (using today's date or similar)
adj_date = "2026-05-21 13:50:00"

# 2. Insert adjustments for overridden producers
# - Negra Corcovado (ID 2): We want final balance = 0.00. Current after flips would be +25.37. Adjustment: debe = 25.37
# - Vicente Osto (ID 9): We want final balance = 0.00. Current after flips would be +14.10. Adjustment: debe = 14.10
# - Diana Aponte (ID 31): We want final balance = -47.74. Current after flips would be -10.72. Adjustment: debe = 37.02
# - Gordo Miranda (ID 36): We want final balance = -4.21. Current is -90.25. Adjustment: haber = 86.04
# - Gustavito (ID 25): We want final balance = -36.79. Current after flips would be -30.29. Adjustment: debe = 6.50

adjustments = [
    (2, 25.37, 0.00, "Ajuste de conciliacion de saldo solicitado por usuario"),
    (9, 14.10, 0.00, "Ajuste de conciliacion de saldo solicitado por usuario"),
    (31, 37.02, 0.00, "Ajuste de conciliacion de saldo solicitado por usuario"),
    (36, 0.00, 86.04, "Ajuste de conciliacion de saldo solicitado por usuario"),
    (25, 6.50, 0.00, "Ajuste de conciliacion de saldo solicitado por usuario")
]

for pid, debe, haber, desc in adjustments:
    c.execute("""
        INSERT INTO movimientos_productores (proveedor_id, fecha, tipo, debe, haber, saldo_momento, descripcion)
        VALUES (?, ?, 'AJUSTE', ?, ?, 0.0, ?)
    """, (pid, adj_date, debe, haber, desc))

# 3. Recalculate running balance (saldo_momento) for all 14 producers
all_requested_ids = [2, 3, 6, 7, 8, 9, 19, 24, 25, 26, 29, 31, 32, 36]

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

# 4. Verify results
print("=== VERIFICATION OF SIMULATED BALANCES ===")
for pid in sorted(all_requested_ids):
    c.execute("SELECT nombre, saldo_pendiente_usd FROM proveedores WHERE id = ?", (pid,))
    name, bal = c.fetchone()
    print(f"ID: {pid:<2} | Name: {name:<25} | Final Balance: {bal:+.2f}")

conn.commit()
conn.close()
