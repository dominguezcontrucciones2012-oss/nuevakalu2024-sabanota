import sqlite3

db_path = "instance/kalu_master.db"

def simulate():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    # 1. Obtener movimientos actuales
    c.execute("""
        SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
        FROM movimientos_productores
        WHERE proveedor_id = 10
        ORDER BY fecha ASC, id ASC
    """)
    rows = c.fetchall()
    
    print("=== SIMULACION DE AJUSTE PARA ANGELITO ===")
    print("Últimos movimientos actuales:")
    for r in rows[-5:]:
        print(f"  ID: {r[0]} | Fecha: {r[1]} | Tipo: {r[2]} | Debe: {r[3]:.6f} | Haber: {r[4]:.6f} | Saldo: {r[5]:.6f} | Desc: {r[6]}")
        
    # Calcular el ajuste exacto necesario
    current_final_balance = rows[-1][5]
    target_final_balance = -80.64
    ajuste_haber = target_final_balance - current_final_balance
    ajuste_debe = 0.00
    print(f"\nSaldo Final Actual: {current_final_balance:.6f}")
    print(f"Saldo Final Esperado: {target_final_balance:.6f}")
    print(f"Ajuste Necesario en Haber: {ajuste_haber:.6f}")
    
    # Crear una lista en memoria simulando el nuevo estado
    sim_rows = list(rows)
    # Insertar el nuevo movimiento simulado al final
    ajuste_sim = (
        9999, # ID temporal
        '2026-05-18 12:16:00.000000',
        'AJUSTE',
        ajuste_debe,
        ajuste_haber,
        0.0,
        'Ajuste de conciliacion de saldo historico'
    )
    sim_rows.append(ajuste_sim)
    
    # Re-ordenar por fecha y luego por ID
    sim_rows.sort(key=lambda x: (x[1], x[0]))
    
    print("\nRecalculando saldos simulados:")
    running = 0.0
    for r in sim_rows:
        mid, date, tipo, debe, haber, _, desc = r
        running = running + haber - debe
        # Mostrar solo los últimos movimientos recalculados
        if date >= '2026-05-18':
            print(f"  ID: {mid} | Fecha: {date} | Tipo: {tipo} | Debe: {debe:.6f} | Haber: {haber:.6f} | Nuevo Saldo: {running:.6f} | Desc: {desc}")
            
    print(f"\nSaldo Final Recalculado: {running:.6f} USD")
    conn.close()

if __name__ == '__main__':
    simulate()
