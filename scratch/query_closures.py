import sys
import os
from datetime import datetime, date

sys.path.append(os.path.abspath(os.path.dirname(__file__) + '/..'))

from app import app
from models import db, CierreCaja, Asiento

with app.app_context():
    print("=== RECENT CLOSURES (CIERRES) ===")
    cierres = CierreCaja.query.order_by(CierreCaja.fecha.desc()).limit(10).all()
    for c in cierres:
        print(f"ID: {c.id} | Fecha: {c.fecha} | Cajero: {c.cajero_nombre} | Real USD: {c.monto_real_usd} | Real Bs: {c.monto_real_bs} | Observaciones: {c.observaciones}")
        print(f"  Esperado USD: {c.monto_usd} | Esperado Bs: {c.monto_bs} | Dif USD: {c.diferencia_usd} | Dif Bs: {c.diferencia_bs}")
        print(f"  Tasa Cierre: {c.tasa_cierre} | Ventas USD: {c.total_ventas_usd} | Compras USD: {c.total_compras_usd}")
        print("--------------------------------------------------")
        
    print("\n=== RECENT ADJUSTMENT ENTRIES (ASIENTOS CIERRE) ===")
    asientos = Asiento.query.filter(Asiento.descripcion.ilike('%cierre%')).order_by(Asiento.id.desc()).limit(5).all()
    for a in asientos:
        print(f"Asiento ID: {a.id} | Fecha: {a.fecha} | Desc: {a.descripcion} | Ref Tipo: {a.referencia_tipo} | Ref ID: {a.referencia_id}")
        for det in a.detalles:
            print(f"  Cuenta: {det.cuenta.nombre} ({det.cuenta.codigo}) | Debe USD: {det.debe_usd} | Haber USD: {det.haber_usd} | Debe Bs: {det.debe_bs} | Haber Bs: {det.haber_bs}")
        print("--------------------------------------------------")
