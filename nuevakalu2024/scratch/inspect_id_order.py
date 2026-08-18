import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Proveedor, MovimientoProductor

with app.app_context():
    for pid in [10, 7]:
        p = Proveedor.query.get(pid)
        print(f"\n==========================================")
        print(f"ORDEN DE INSERCIÓN (ID) DE: {p.nombre} (ID: {p.id})")
        print(f"==========================================")
        
        movs = MovimientoProductor.query.filter_by(proveedor_id=p.id).order_by(MovimientoProductor.id.asc()).all()
        
        saldo_calculado = 0.0
        for m in movs:
            debe = float(m.debe or 0)
            haber = float(m.haber or 0)
            saldo_esperado = saldo_calculado + haber - debe
            
            print(
                f"ID: {m.id:4d} | Fecha: {m.fecha.strftime('%Y-%m-%d %H:%M:%S')} | Tipo: {m.tipo:15s} | "
                f"Debe: {debe:7.2f} | Haber: {haber:7.2f} | "
                f"Reg: {float(m.saldo_momento):8.2f} | Calc: {saldo_esperado:8.2f} | Diff: {float(m.saldo_momento) - saldo_esperado:8.2f} | Desc: {m.descripcion}"
            )
            saldo_calculado = float(m.saldo_momento)
