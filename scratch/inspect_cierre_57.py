import sys
import os
from datetime import datetime, date

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, CierreCaja, Asiento

with app.app_context():
    cierre = CierreCaja.query.get(57)
    if cierre:
        print("=== DETALLES DEL CIERRE 57 ===")
        print(f"ID: {cierre.id}")
        print(f"Fecha (en DB): {cierre.fecha}")
        print(f"Cajero Nombre: {cierre.cajero_nombre}")
        print(f"Monto USD: {cierre.monto_usd}")
        print(f"Monto Bs: {cierre.monto_bs}")
        print(f"Observaciones: {cierre.observaciones}")
        
        # Let's find any asiento for this closure
        asientos = Asiento.query.filter(
            Asiento.descripcion.like(f"%CIERRE%")
        ).all()
        for a in asientos:
            if str(cierre.fecha) in a.descripcion:
                print(f"\nAsiento Asociado:")
                print(f"  ID: {a.id}")
                print(f"  Fecha Asiento: {a.fecha}")
                print(f"  Descripcion: {a.descripcion}")
                print(f"  Usuario ID: {a.user_id}")
                if a.user:
                    print(f"  Usuario Username: {a.user.username}")
    else:
        print("Cierre 57 no existe.")
