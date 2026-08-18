import sqlite3

db_path = "instance/kalu_master.db"

target_suppliers = [
    {"name": "ALFONZO", "id": 1},
    {"name": "NEGRA CORCOVADO", "id": 2},
    {"name": "PEDRITO CORCOVADO", "id": 3},
    {"name": "TULIO CORRO", "id": 4},
    {"name": "MARCOS CORRO", "id": 7},
    {"name": "LUIS MIGUEL CAMORUCO", "id": 8},
    {"name": "VICENTE OSTO", "id": 9},
    {"name": "ANGELITO", "id": 10},
    {"name": "ANDRES CORRO", "id": 19},
    {"name": "ESTEBAN ALVAREZ", "id": 24},
    {"name": "GUSTAVITO", "id": 25},
    {"name": "COA MIRANDA", "id": 26},
    {"name": "alexander panqueca", "id": 29},
    {"name": "andres eloy", "id": 30},
    {"name": "DIANA APONTE", "id": 31},
    {"name": "DERSY CORRO", "id": 32},
    {"name": "Gordo miranda", "id": 36}
]

# We only want to analyze the ones the user requested (excluding Alfonzo, Angelito, andres eloy, Tulio Corro, which are already repaired)
requested_names = [
    "ANDRES CORRO",
    "COA MIRANDA",
    "DIANA APONTE",
    "Gordo miranda",
    "LUIS MIGUEL CAMORUCO",
    "PEDRITO CORCOVADO",
    "alexander panqueca",
    "VICENTE OSTO",
    "NEGRA CORCOVADO",
    "MARCOS CORRO",
    "LUIS CORR0", # ID 6
    "GUSTAVITO",
    "ESTEBAN ALVAREZ",
    "DERSY CORRO"
]

def analyze():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    print("=== DETAILED WRONG ABONOS ANALYSIS ===")
    
    # First, let's map the requested names to IDs
    # Let's find LUIS CORR0 (ID 6)
    requested_ids = []
    id_to_name = {}
    for rname in requested_names:
        # Search in DB
        q_name = rname.replace("0", "O").strip()
        c.execute("SELECT id, nombre FROM proveedores WHERE nombre LIKE ?", (f"%{q_name}%",))
        res = c.fetchall()
        if not res and rname != q_name:
            c.execute("SELECT id, nombre FROM proveedores WHERE nombre LIKE ?", (f"%{rname}%",))
            res = c.fetchall()
        if res:
            for pid, name in res:
                requested_ids.append(pid)
                id_to_name[pid] = name
        else:
            print(f"Warning: could not find supplier matching '{rname}'")
            
    print(f"Analyzing IDs: {requested_ids}\n")
    
    for pid in sorted(requested_ids):
        name = id_to_name[pid]
        c.execute("SELECT saldo_pendiente_usd FROM proveedores WHERE id = ?", (pid,))
        current_balance = float(c.fetchone()[0])
        
        # Get all movements
        c.execute("""
            SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
            FROM movimientos_productores
            WHERE proveedor_id = ?
            ORDER BY fecha ASC, id ASC
        """, (pid,))
        movs = c.fetchall()
        
        # We classify wrong abonos:
        # 1. Type is exactly 'ABONO_POS' and debe > 0
        # 2. Description contains 'Abono POS' and debe > 0
        wrong_abonos = []
        
        # Let's inspect each movement
        for mid, fecha, tipo, debe, haber, saldo_mom, desc in movs:
            debe = float(debe or 0.0)
            haber = float(haber or 0.0)
            
            is_wrong = False
            if debe > 0.0:
                if tipo == 'ABONO_POS':
                    is_wrong = True
                elif 'ABONO POS' in str(desc).upper():
                    is_wrong = True
                    
            if is_wrong:
                wrong_abonos.append((mid, fecha, tipo, debe, desc))
                
        # Now let's calculate what the balance would be if only these wrong_abonos were corrected
        running = 0.0
        for mid, fecha, tipo, debe, haber, saldo_mom, desc in movs:
            debe = float(debe or 0.0)
            haber = float(haber or 0.0)
            
            # If it's one of our identified wrong abonos, move it from debe to haber
            is_wrong = any(wa[0] == mid for wa in wrong_abonos)
            if is_wrong:
                running = running + debe - 0.0
            else:
                running = running + haber - debe
                
        print(f"ID: {pid} | Provider: {name}")
        print(f"  Current Balance in DB: {current_balance:+.2f}")
        if wrong_abonos:
            print(f"  Found {len(wrong_abonos)} wrong ABONO_POS transactions in DEBE:")
            for mid, fecha, tipo, debe, desc in wrong_abonos:
                print(f"    - ID {mid} | {fecha} | Amount: {debe} | Desc: {desc}")
            print(f"  Proposed Corrected Balance: {running:+.2f}")
        else:
            print("  No wrong ABONO_POS transactions found.")
            # Let's check if there are other suspicious items
            suspicious = []
            for mid, fecha, tipo, debe, haber, saldo_mom, desc in movs:
                debe = float(debe or 0.0)
                if debe > 0.0 and ('ABONO' in str(tipo).upper() or 'ABONO' in str(desc).upper()):
                    suspicious.append((mid, fecha, tipo, debe, desc))
            if suspicious:
                print("  [!] Other transactions with 'ABONO' in type/desc but in DEBE:")
                for mid, fecha, tipo, debe, desc in suspicious:
                    print(f"    - ID {mid} | {fecha} | Type: {tipo} | Amount: {debe} | Desc: {desc}")
            else:
                print("  No other suspicious abonos in DEBE.")
        print("-" * 60)

    conn.close()

if __name__ == "__main__":
    analyze()
