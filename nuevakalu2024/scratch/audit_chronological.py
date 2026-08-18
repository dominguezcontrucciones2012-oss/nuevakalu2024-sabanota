import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Proveedor, MovimientoProductor

with app.app_context():
    output = []
    
    for pid in [10, 7]:
        p = Proveedor.query.get(pid)
        output.append(f"\n==========================================")
        output.append(f"AUDITORIA CRONOLOGICA DE: {p.nombre} (ID: {p.id})")
        output.append(f"==========================================")
        
        # Obtenemos todos los movimientos ordenados por fecha
        movs = MovimientoProductor.query.filter_by(proveedor_id=p.id).order_by(MovimientoProductor.fecha.asc()).all()
        
        saldo_calculado = 0.0
        for m in movs:
            debe = float(m.debe or 0)
            haber = float(m.haber or 0)
            
            # Calculamos el saldo acumulado real paso a paso
            saldo_calculado_anterior = saldo_calculado
            saldo_calculado = saldo_calculado_anterior + haber - debe
            
            diff = float(m.saldo_momento) - saldo_calculado
            
            output.append(
                f"ID: {m.id:4d} | Fecha: {m.fecha.strftime('%Y-%m-%d %H:%M:%S')} | Tipo: {m.tipo:15s} | "
                f"Debe: {debe:7.2f} | Haber: {haber:7.2f} | "
                f"Reg: {float(m.saldo_momento):8.2f} | Calc: {saldo_calculado:8.2f} | Diff: {diff:8.2f} | Desc: {m.descripcion}"
            )
            
        output.append(f"Saldo Final Calculado: {saldo_calculado:.2f} | Saldo en BD: {p.saldo_pendiente_usd}")
        
    with open('scratch/audit_results.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(output))
    print("Auditoría guardada en scratch/audit_results.txt")
