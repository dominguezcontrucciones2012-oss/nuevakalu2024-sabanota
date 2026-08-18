import sqlite3

def inspect():
    conn = sqlite3.connect("backups/respaldo_kalu_2026-05-20_02-58-16.db")
    c = conn.cursor()
    
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 30
        ORDER BY id ASC
    """)
    rows = c.fetchall()
    conn.close()
    
    # Let's map row ID to its index in the ID sort
    id_to_idx = {r[0]: idx for idx, r in enumerate(rows)}
    
    def print_around(target_id, window=5):
        if target_id not in id_to_idx:
            print(f"ID {target_id} not found")
            return
        idx = id_to_idx[target_id]
        start = max(0, idx - window)
        end = min(len(rows), idx + window + 1)
        print(f"\n=== Transactions around ID {target_id} (index {idx}) ===")
        for i in range(start, end):
            r = rows[i]
            print(f"Index: {i:3d} | ID: {r[0]:4d} | Date: {r[1]} | Type: {r[2]:10s} | Debe: {r[3]:6.2f} | Haber: {r[4]:6.2f} | DB Saldo: {r[5]:7.2f} | Desc: {r[6][:50]}")

    print_around(457)
    print_around(893)
    print_around(920)

if __name__ == '__main__':
    inspect()
