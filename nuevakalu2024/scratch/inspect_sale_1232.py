import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Venta, DetalleVenta

with app.app_context():
    for vid in [1232, 1266]:
        v = Venta.query.get(vid)
        if v:
            print(f"\n==========================================")
            print(f"DETALLE VENTA ID: {v.id}")
            print(f"==========================================")
            for col in v.__table__.columns:
                print(f"{col.name}: {getattr(v, col.name)}")
            
            detalles = DetalleVenta.query.filter_by(venta_id=v.id).all()
            print("Items:")
            for d in detalles:
                p = d.producto
                print(f"  - Prod: {p.nombre} | Cant: {d.cantidad} | Precio: {d.precio_unitario_usd}")
