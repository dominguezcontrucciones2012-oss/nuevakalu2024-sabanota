import sys
import os
from datetime import datetime, date

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, CierreCaja, Asiento

with app.app_context():
    cierre = CierreCaja.query.get(58)
    if cierre:
        print("=== DETALLES DEL CIERRE 58 ===")
        print(f"ID: {cierre.id}")
        print(f"Fecha (en DB): {cierre.fecha}")
        print(f"Cajero Nombre: {cierre.cajero_nombre}")
        print(f"Monto USD: {cierre.monto_usd}")
        print(f"Monto Bs: {cierre.monto_bs}")
        print(f"Observaciones: {cierre.observaciones}")
        
        asiento = Asiento.query.filter(
            Asiento.referencia_tipo == 'CIERRE_AJUSTE',
            Asiento.descripcion.like(f"%{cierre.fecha}%")
        ).first()
        if asiento:
            print(f"\nAsiento de Ajuste Asociado:")
            print(f"  ID: {asiento.id}")
            print(f"  Fecha Asiento: {asiento.fecha}")
            print(f"  Descripcion: {asiento.descripcion}")
            print(f"  Usuario ID: {asiento.user_id}")
            if asiento.user:
                print(f"  Usuario Username: {asiento.user.username}")
        else:
            print("\nNo direct CIERRE_AJUSTE found for this date. Let's look for any cierre asientos:")
            asientos = Asiento.query.filter(
                Asiento.referencia_tipo.in_(['CIERRE', 'CIERRE_AJUSTE'])
            ).all()
            for a in asientos:
                print(f"  Asiento ID: {a.id} | Fecha: {a.fecha} | Desc: {a.descripcion} | Ref: {a.referencia_tipo} | User: {a.user.username if a.user else 'N/A'}")
    else:
        print("Cierre 58 no existe.")
        
    print("\n=== ULTIMOS 5 CIERRES EN LA DB ===")
    cierres = CierreCaja.query.order_by(CierreCaja.id.desc()).limit(5).all()
    for c in cierres:
        print(f"Cierre ID: {c.id} | Fecha: {c.fecha} | Cajero: {c.cajero_nombre} | Real USD: {c.monto_real_usd} | Real Bs: {c.monto_real_bs}")
