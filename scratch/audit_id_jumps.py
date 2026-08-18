import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Proveedor, MovimientoProductor

with app.app_context():
    productores = Proveedor.query.filter(
        (Proveedor.es_productor == True) | (Proveedor.es_obrero == True)
    ).all()
    
    output_path = os.path.join(os.path.dirname(__file__), 'audit_id_jumps_results.txt')
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("INICIANDO AUDITORIA EN ORDEN DE INSERCION (ID) DE SALTOS DE SALDO...\n")
        f.write("=" * 80 + "\n")
        
        for p in productores:
            # Traer todos los movimientos en orden de ID estrictamente
            movs = MovimientoProductor.query.filter_by(proveedor_id=p.id).order_by(
                MovimientoProductor.id.asc()
            ).all()
            
            if not movs:
                continue
                
            running_balance = 0.0
            jumps_found = []
            
            for m in movs:
                debe = float(m.debe or 0)
                haber = float(m.haber or 0)
                expected = running_balance + haber - debe
                actual = float(m.saldo_momento or 0)
                
                diff = actual - expected
                if abs(diff) >= 0.01:
                    jumps_found.append({
                        'id': m.id,
                        'fecha': m.fecha.strftime('%Y-%m-%d %H:%M:%S'),
                        'tipo': m.tipo,
                        'desc': m.descripcion or '',
                        'expected': expected,
                        'actual': actual,
                        'diff': diff
                    })
                # El saldo del momento se convierte en la base para el siguiente movimiento en base de datos
                running_balance = actual
                
            if jumps_found:
                f.write(f"\nProductor: {p.nombre} (ID: {p.id})\n")
                f.write(f"  Saldo Actual BD: {float(p.saldo_pendiente_usd):.2f}\n")
                f.write("-" * 50 + "\n")
                for j in jumps_found:
                    f.write(
                        f"  [SALTO BD] ID: {j['id']:4d} | Fecha: {j['fecha']} | Tipo: {j['tipo']:12s} |\n"
                        f"    Esperado: {j['expected']:8.2f} | Registrado: {j['actual']:8.2f} | Desviacion: {j['diff']:+8.2f} |\n"
                        f"    Desc: {j['desc']}\n"
                    )
                f.write("-" * 80 + "\n")
                
    print(f"Auditoria en orden de ID completada. Resultados guardados en: {output_path}")
