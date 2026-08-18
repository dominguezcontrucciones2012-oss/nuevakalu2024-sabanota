import sys
import os
from decimal import Decimal
from datetime import datetime

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, CierreCaja, Asiento

with app.app_context():
    for cid in [57, 58]:
        c = CierreCaja.query.get(cid)
        if c:
            print(f"=== DETALLES DEL CIERRE {cid} ===")
            print(f"ID: {c.id}")
            print(f"Fecha (en DB): {c.fecha}")
            print(f"Cajero Nombre: {c.cajero_nombre}")
            print(f"Observaciones: '{c.observaciones}'")
            print(f"Tasa Cierre: {c.tasa_cierre}")
            print(f"Esperado USD: {c.monto_usd} | Real USD: {c.monto_real_usd} | Dif USD: {c.diferencia_usd}")
            print(f"Esperado Bs: {c.monto_bs} | Real Bs: {c.monto_real_bs} | Dif Bs: {c.diferencia_bs}")
            print(f"Esperado Pago Movil: {c.pago_movil} | Real Pago Movil: {c.monto_real_bs}") # Wait, real PM isn't directly in a separate field in CierreCaja, let's see. Or wait, does the model have real fields for those? Let's check.
            
            # Let's print all attributes of the cierre object to be sure
            for k, v in sorted(c.__dict__.items()):
                if not k.startswith('_') and k not in ['detalle_ventas', 'detalle_compras']:
                    print(f"  {k}: {v}")
            
            # Look for asientos
            asientos = Asiento.query.filter(
                Asiento.descripcion.like(f"%CIERRE%"),
                Asiento.descripcion.like(f"%{c.fecha}%")
            ).all()
            print("  Asientos asociados:")
            for a in asientos:
                print(f"    Asiento ID={a.id} | Fecha={a.fecha} | Desc={a.descripcion} | Ref={a.referencia_tipo} | User={a.user.username if a.user else 'N/A'}")
            print("-" * 40)
        else:
            print(f"Cierre {cid} no existe.")
