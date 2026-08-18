import sqlite3

db_path = "instance/kalu_master.db"

def analyze():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    # Check all distinct types of movements
    c.execute("""
        SELECT tipo, COUNT(*), SUM(debe), SUM(haber)
        FROM movimientos_productores
        GROUP BY tipo
    """)
    print("=== MOVEMENT TYPES AND TOTALS ===")
    for row in c.fetchall():
        print(f"Tipo: {row[0]:20s} | Count: {row[1]:5d} | Sum(Debe): {row[2]:12.2f} | Sum(Haber): {row[3]:12.2f}")
        
    # Let's inspect some samples of each type
    print("\n=== SAMPLE TRANSACTIONS PER TYPE ===")
    c.execute("SELECT DISTINCT tipo FROM movimientos_productores")
    types = [r[0] for r in c.fetchall()]
    for t in types:
        print(f"\n--- Sample for Tipo: {t} ---")
        c.execute("""
            SELECT id, proveedor_id, debe, haber, descripcion
            FROM movimientos_productores
            WHERE tipo = ?
            LIMIT 5
        """, (t,))
        for row in c.fetchall():
            print(f"  ID: {row[0]} | Prov ID: {row[1]} | Debe: {row[2]} | Haber: {row[3]} | Desc: {row[4]}")
            
    conn.close()

if __name__ == "__main__":
    analyze()
