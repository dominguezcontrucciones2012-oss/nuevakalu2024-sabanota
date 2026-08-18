import sqlite3

def main():
    conn = sqlite3.connect('instance/kalu_master.db')
    c = conn.cursor()
    
    print("=== Todos los Movimientos de ANGELITO (ID 10) ===")
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 10
        ORDER BY fecha ASC, id ASC
    """)
    movs = c.fetchall()
    for m in movs:
        # Check if debe or haber have more than 2 decimal places
        debe_str = f"{m[3]:.6f}" if m[3] is not None else "None"
        haber_str = f"{m[4]:.6f}" if m[4] is not None else "None"
        saldo_str = f"{m[5]:.6f}" if m[5] is not None else "None"
        print(f"ID: {m[0]} | Fecha: {m[1]} | Tipo: {m[2]} | Debe: {debe_str} | Haber: {haber_str} | Saldo Momento: {saldo_str} | Desc: {m[6]}")
        
    conn.close()

if __name__ == '__main__':
    main()
