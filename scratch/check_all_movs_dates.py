import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, MovimientoProductor, Proveedor
from datetime import datetime

with app.app_context():
    start_date = datetime(2026, 4, 9)
    end_date = datetime(2026, 4, 14)
    
    movs = MovimientoProductor.query.filter(
        MovimientoProductor.fecha.between(start_date, end_date)
    ).order_by(MovimientoProductor.fecha.asc()).all()
    
    print(f"Total movimientos entre {start_date} y {end_date}: {len(movs)}")
    for m in movs:
        p = Proveedor.query.get(m.proveedor_id)
        print(
            f"ID: {m.id:4d} | Fecha: {m.fecha} | Prov: {p.nombre:20s} (ID: {p.id:2d}) | "
            f"Tipo: {m.tipo:12s} | Debe: {float(m.debe or 0):7.2f} | Haber: {float(m.haber or 0):7.2f} | "
            f"Reg: {float(m.saldo_momento or 0):8.2f} | Desc: {m.descripcion}"
        )
