import sqlite3
from itertools import combinations

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

def search_for_prov(prov_id, name, current_db_balance):
    c.execute("""
        SELECT m.id, m.fecha, m.tipo, m.debe, m.haber, m.saldo_momento, m.descripcion
        FROM movimientos_productores m
        WHERE m.proveedor_id = ?
        ORDER BY m.fecha ASC, m.id ASC
    """, (prov_id,))
    rows = c.fetchall()

    target = -29.34
    print(f"\n==========================================")
    print(f"SEARCHING FOR: {name} (ID {prov_id})")
    print(f"Target Balance: {target}")
    print(f"Current DB Balance: {current_db_balance}")
    print(f"Difference needed: {target - current_db_balance:.4f}")
    print(f"==========================================")

    # Let's test combinations of corrections
    movements_to_consider = []
    for r in rows:
        mid, fecha, tipo, debe, haber, db_saldo, desc = r
        debe_val = float(debe or 0)
        haber_val = float(haber or 0)
        if debe_val > 0:
            movements_to_consider.append((mid, tipo, debe_val, 'debe_to_haber', 2 * debe_val, desc))
        if haber_val > 0:
            movements_to_consider.append((mid, tipo, haber_val, 'haber_to_debe', -2 * haber_val, desc))

    for r in range(1, 4):
        for combo in combinations(movements_to_consider, r):
            total_change = sum(x[4] for x in combo)
            new_balance = current_db_balance + total_change
            if abs(new_balance - target) <= 0.05:
                print(f"Combo size {r} MATCH:")
                for x in combo:
                    print(f"  ID: {x[0]} | Type: {x[1]} | Val: {x[2]} | Action: {x[3]} | Desc: {x[5][:40]}")
                print(f"  -> Yields Balance: {new_balance:.2f}\n")

search_for_prov(19, "ANDRES CORRO", -64.29793987049028)
search_for_prov(30, "andres eloy", -320.88)
conn.close()
