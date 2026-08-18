import sqlite3

db_path = "instance/kalu_master.db"

target_names = [
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
    "LUIS CORR0", # Could be LUIS CORRO or LUIS CORR0
    "GUSTAVITO",
    "ESTEBAN ALVAREZ",
    "DERSY CORRO"
]

def search_supplier(c, name):
    q_name = name.replace("0", "O").strip() # replace zero with O for matching
    c.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE nombre LIKE ?", (f"%{q_name}%",))
    res = c.fetchall()
    if not res and name != q_name:
        c.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE nombre LIKE ?", (f"%{name}%",))
        res = c.fetchall()
    return res

def analyze():
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    output = []
    output.append("=== RESEARCHING SUPPLIERS ===")
    
    found_map = {}
    for name in target_names:
        matches = search_supplier(c, name)
        if not matches:
            parts = name.split()
            if len(parts) > 1:
                c.execute("SELECT id, nombre, saldo_pendiente_usd FROM proveedores WHERE nombre LIKE ? OR nombre LIKE ?", (f"%{parts[0]}%", f"%{parts[-1]}%"))
                matches = c.fetchall()
        found_map[name] = matches

    for original_name, matches in found_map.items():
        output.append(f"\nTarget: '{original_name}'")
        if not matches:
            output.append("  [!] NO MATCH FOUND")
            continue
        
        for pid, name, current_bal in matches:
            output.append(f"  -> Found ID: {pid} | Name: '{name}' | Current Balance: {current_bal}")
            
            # Fetch all movements chronologically
            c.execute("""
                SELECT id, fecha, tipo, debe, haber, saldo_momento, descripcion
                FROM movimientos_productores
                WHERE proveedor_id = ?
                ORDER BY fecha ASC, id ASC
            """, (pid,))
            movements = c.fetchall()
            
            wrong_abonos = []
            running_corrected = 0.0
            running_current = 0.0
            
            output.append("     Movements Analysis:")
            for mid, fecha, tipo, debe, haber, saldo_mom, desc in movements:
                debe = float(debe or 0.0)
                haber = float(haber or 0.0)
                
                is_abono_type = 'ABONO' in str(tipo).upper() or 'PAGO' in str(tipo).upper()
                is_abono_desc = 'ABONO' in str(desc).upper() or 'PAGO' in str(desc).upper()
                
                is_wrong = False
                if debe > 0.0 and (is_abono_type or is_abono_desc):
                    is_wrong = True
                    wrong_abonos.append((mid, fecha, tipo, debe, desc))
                
                running_current = running_current + haber - debe
                
                if is_wrong:
                    running_corrected = running_corrected + debe - 0.0
                else:
                    running_corrected = running_corrected + haber - debe
            
            if wrong_abonos:
                output.append(f"     [!] FOUND {len(wrong_abonos)} SUSPICIOUS/WRONG ABONOS IN DEBE:")
                for mid, fecha, tipo, debe, desc in wrong_abonos:
                    output.append(f"       - ID {mid} | {fecha} | {tipo} | Amount: {debe} | Desc: {desc}")
                output.append(f"     Proposed Recalculated Final Balance: {running_corrected:.2f}")
                output.append(f"     Current running calculation: {running_current:.2f}")
            else:
                output.append("     [OK] No suspicious abonos found in 'debe' for this provider.")
                output.append(f"     Current running calculation: {running_current:.2f}")
                
    conn.close()
    
    # Write to UTF-8 file
    with open("scratch/research_results_utf8.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(output))
    print("Results saved to scratch/research_results_utf8.txt")

if __name__ == "__main__":
    analyze()
