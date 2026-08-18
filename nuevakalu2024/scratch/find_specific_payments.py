import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Proveedor, MovimientoProductor

with app.app_context():
    output = []
    output.append("=== BUSCANDO PRODUCTORES DE INTERES ===")
    prods = Proveedor.query.all()
    for p in prods:
        if any(x in p.nombre.lower() for x in ['angel', 'marco', 'corro']):
            output.append(f"ID: {p.id} | Nombre: {p.nombre} | RIF: {p.rif} | Saldo Actual en BD: {p.saldo_pendiente_usd}")
            
    # Vamos a obtener los movimientos de todos los que coincidan
    target_ids = [p.id for p in prods if any(x in p.nombre.lower() for x in ['angel', 'marco', 'corro'])]
    
    for pid in target_ids:
        p = Proveedor.query.get(pid)
        if not p:
            continue
        output.append(f"\n==========================================")
        output.append(f"MOVIMIENTOS DE: {p.nombre} (ID: {p.id}) | Saldo Actual: {p.saldo_pendiente_usd}")
        output.append(f"==========================================")
        
        movs = MovimientoProductor.query.filter_by(proveedor_id=p.id).order_by(MovimientoProductor.id.asc()).all()
        
        saldo_calculado = 0.0
        for m in movs:
            debe = float(m.debe or 0)
            haber = float(m.haber or 0)
            
            # En la libreta de productor:
            # - Haber es lo que le debemos (queso entregado, nomina, etc. -> Aumenta su saldo a favor)
            # - Debe es lo que le pagamos o cobramos (POS, anticipo, etc. -> Disminuye su saldo a favor / resta)
            # Vamos a calcular el saldo esperado y compararlo con m.saldo_momento.
            # Pero ojo: el saldo esperado = saldo_anterior + haber - debe.
            # Vamos a ver qué formula se usó.
            saldo_esperado = saldo_calculado + haber - debe
            
            output.append(
                f"ID: {m.id:4d} | Fecha: {m.fecha.strftime('%Y-%m-%d')} | Tipo: {m.tipo:15s} | "
                f"Debe: {debe:7.2f} | Haber: {haber:7.2f} | "
                f"Reg: {float(m.saldo_momento):8.2f} | Calc: {saldo_esperado:8.2f} | Desc: {m.descripcion}"
            )
            saldo_calculado = saldo_esperado
            
        output.append(f"Saldo final calculado acumulativo: {saldo_calculado:.2f} | Saldo en BD: {p.saldo_pendiente_usd}")

    # Guardar en un archivo txt
    with open('scratch/movimientos_productores.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(output))
    print("¡Listo! Resultados guardados en scratch/movimientos_productores.txt")
