import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, MovimientoProductor, Proveedor

with app.app_context():
    print("Buscando movimientos relacionados con 124.50 o 124.66...")
    movs = MovimientoProductor.query.filter(
        (MovimientoProductor.debe.between(124.0, 125.0)) | 
        (MovimientoProductor.haber.between(124.0, 125.0))
    ).all()
    
    for m in movs:
        p = Proveedor.query.get(m.proveedor_id)
        print(f"Mov ID: {m.id} | Prov: {p.nombre} (ID: {p.id}) | Tipo: {m.tipo} | Debe: {m.debe} | Haber: {m.haber} | Fecha: {m.fecha} | Desc: {m.descripcion}")
        
    print("\nBuscando si hay algún productor cuyo saldo actual tenga una discrepancia...")
    # Busquemos todos los productores y comparemos el saldo acumulado vs saldo actual
    for p in Proveedor.query.filter((Proveedor.es_productor==True) | (Proveedor.es_obrero==True)).all():
        movs_p = MovimientoProductor.query.filter_by(proveedor_id=p.id).order_by(MovimientoProductor.fecha.asc()).all()
        saldo_calc = 0.0
        for m in movs_p:
            saldo_calc += float(m.haber or 0) - float(m.debe or 0)
        diff = float(p.saldo_pendiente_usd or 0) - saldo_calc
        if abs(diff) > 0.01:
            print(f"Productor: {p.nombre:25s} | Saldo BD: {float(p.saldo_pendiente_usd):8.2f} | Saldo Calc: {saldo_calc:8.2f} | Diff: {diff:8.2f}")
