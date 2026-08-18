import sqlite3

db_path = "instance/kalu_master.db"

target_ids = [2, 3, 6, 7, 8, 9, 19, 24, 25, 26, 29, 31, 32, 36]

def inspect():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    output = []
    output.append("=== INSPECTING ALL DEBITS WITH 'ABONO' OR 'PAGO' IN DESC ===")
    for pid in sorted(target_ids):
        c.execute("SELECT nombre FROM proveedores WHERE id = ?", (pid,))
        name = c.fetchone()[0]
        
        c.execute("""
            SELECT id, fecha, tipo, debe, haber, descripcion
            FROM movimientos_productores
            WHERE proveedor_id = ? AND debe > 0
            AND (descripcion LIKE '%abono%' OR descripcion LIKE '%pago%' OR tipo = 'ABONO_POS')
            ORDER BY fecha ASC, id ASC
        """, (pid,))
        rows = c.fetchall()
        
        output.append(f"\nID: {pid} | Provider: {name} | Count: {len(rows)}")
        for r in rows:
            output.append(f"  ID: {r[0]} | Date: {r[1]} | Type: {r[2]} | Debe: {r[3]:.2f} | Haber: {r[4]:.2f} | Desc: {r[5]}")
            
    conn.close()
    
    with open("scratch/debe_payments_results.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(output))
    print("Saved results to scratch/debe_payments_results.txt")

if __name__ == "__main__":
    inspect()
