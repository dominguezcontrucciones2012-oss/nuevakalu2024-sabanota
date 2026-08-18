import sqlite3

conn = sqlite3.connect("instance/kalu_master.db")
c = conn.cursor()

c.execute("""
    SELECT m.id, m.fecha, m.tipo, m.debe, m.haber, m.saldo_momento, m.descripcion
    FROM movimientos_productores m
    WHERE m.proveedor_id = 30
    ORDER BY m.fecha ASC, m.id ASC
""")
rows = c.fetchall()

with open("scratch/check_andres_step_diffs.txt", "w", encoding="utf-8") as f:
    f.write(f"{'Index':5s} | {'ID':4s} | {'Fecha':23s} | {'Tipo':10s} | {'Debe':8s} | {'Haber':8s} | {'DB Saldo':10s} | {'Diff':8s} | {'Anomaly':40s} | {'Description':50s}\n")
    f.write("-" * 180 + "\n")
    prev_saldo = 0.0
    for i, r in enumerate(rows):
        mid, fecha, tipo, debe, haber, db_saldo, desc = r
        debe_val = float(debe or 0)
        haber_val = float(haber or 0)
        db_saldo_val = float(db_saldo or 0)
        diff = db_saldo_val - prev_saldo
        
        # expected change based on columns
        expected_change = haber_val - debe_val
        anomaly = ""
        if abs(diff - expected_change) > 0.01:
            anomaly = f"expected {expected_change:+.2f}, got {diff:+.2f}"
            
        f.write(f"{i:5d} | {mid:4d} | {fecha:23s} | {tipo:10s} | {debe_val:8.2f} | {haber_val:8.2f} | {db_saldo_val:10.2f} | {diff:+8.2f} | {anomaly:40s} | {desc[:60]}\n")
        prev_saldo = db_saldo_val

conn.close()
