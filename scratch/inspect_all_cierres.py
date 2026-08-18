import sys
import os
from datetime import datetime, date

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, CierreCaja, Asiento

with app.app_context():
    cierres = CierreCaja.query.order_by(CierreCaja.id.desc()).limit(10).all()
    print("=== ULTIMOS 10 CIERRES EN DETALLE ===")
    for c in cierres:
        print(f"ID: {c.id}")
        print(f"  Fecha: {c.fecha}")
        print(f"  Cajero: {c.cajero_nombre}")
        print(f"  Esperado USD: {c.monto_usd} | Real USD: {c.monto_real_usd}")
        print(f"  Esperado Bs: {c.monto_bs} | Real Bs: {c.monto_real_bs}")
        print(f"  Observaciones: {c.observaciones}")
        
        # Look for asientos
        asiento = Asiento.query.filter(
            Asiento.descripcion.like(f"%CIERRE%"),
            Asiento.descripcion.like(f"%{c.fecha}%")
        ).first()
        if asiento:
            print(f"  Asiento: ID={asiento.id} | Fecha={asiento.fecha} | Desc={asiento.descripcion} | Ref={asiento.referencia_tipo}")
        else:
            print("  Asiento: NINGUNO")
        print("-" * 40)
