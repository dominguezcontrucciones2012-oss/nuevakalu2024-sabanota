import sqlite3
import os
from datetime import datetime

db_path = r'D:\nuevakalu2024\instance\kalu_master.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    today = '2026-05-06'
    print(f"--- Sales Report for {today} ---")
    
    # Total sales today
    cursor.execute("SELECT COUNT(*), SUM(total_usd) FROM ventas WHERE fecha LIKE ?", (f"{today}%",))
    count, total_sum = cursor.fetchone()
    print(f"Total sales count: {count}")
    print(f"Total sum USD: {total_sum}")
    
    # Breakdown of payments
    cursor.execute("""
        SELECT 
            SUM(pago_efectivo_usd),
            SUM(pago_efectivo_bs),
            SUM(pago_movil_bs),
            SUM(pago_transferencia_bs),
            SUM(biopago_bdv),
            SUM(pago_debito_bs),
            SUM(pago_otros_usd)
        FROM ventas 
        WHERE fecha LIKE ?
    """, (f"{today}%",))
    payments = cursor.fetchone()
    print("\n--- Payment Breakdown ---")
    print(f"Efectivo USD: {payments[0]}")
    print(f"Efectivo Bs: {payments[1]}")
    print(f"Pago Móvil Bs: {payments[2]}")
    print(f"Transferencia Bs: {payments[3]}")
    print(f"Biopago: {payments[4]}")
    print(f"Débito: {payments[5]}")
    print(f"Otros USD: {payments[6]}")
    
    # Look for high value sales or suspicious ones
    print("\n--- Top 10 Highest Sales Today ---")
    cursor.execute("""
        SELECT id, fecha, total_usd, pago_efectivo_usd, pago_otros_usd, tasa_momento 
        FROM ventas 
        WHERE fecha LIKE ? 
        ORDER BY total_usd DESC 
        LIMIT 10
    """, (f"{today}%",))
    rows = cursor.fetchall()
    for row in rows:
        print(f"ID: {row[0]} | Fecha: {row[1]} | Total USD: {row[2]} | Efec USD: {row[3]} | Otros USD: {row[4]} | Tasa: {row[5]}")

    # Check for sales with unusually high USD payments compared to total
    print("\n--- Sales with High USD Payments ---")
    cursor.execute("""
        SELECT id, total_usd, pago_efectivo_usd, pago_otros_usd 
        FROM ventas 
        WHERE fecha LIKE ? AND (pago_efectivo_usd > 50 OR pago_otros_usd > 50)
    """, (f"{today}%",))
    rows = cursor.fetchall()
    for row in rows:
        print(row)

    conn.close()
else:
    print(f"Database not found at {db_path}")
