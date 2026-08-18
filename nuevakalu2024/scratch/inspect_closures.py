import os
import sys
from datetime import datetime, date

sys.path.append(os.path.abspath(os.path.dirname(__file__) + '/..'))

from app import app
from models import db, CierreCaja, Venta, HistorialPago

with app.app_context():
    print("=== INSPECIONANDO CIERRES DE CAJA RECIENTES ===")
    cierres = CierreCaja.query.order_by(CierreCaja.fecha.desc()).limit(5).all()
    for c in cierres:
        print(f"\nID: {c.id}")
        print(f"Fecha: {c.fecha}")
        print(f"Creado En (si tiene timestamp o ID): {c.id}")
        print(f"Tasa Cierre: {c.tasa_cierre}")
        print(f"Monto USD (esperado): {c.monto_usd}")
        print(f"Monto Bs (esperado): {c.monto_bs}")
        print(f"Monto Real USD: {c.monto_real_usd}")
        print(f"Monto Real Bs: {c.monto_real_bs}")
        print(f"Diferencia USD: {c.diferencia_usd}")
        print(f"Diferencia Bs: {c.diferencia_bs}")
        print(f"Cajero: {c.cajero_nombre}")
        print(f"Observaciones: {c.observaciones}")
        print(f"Ventas USD (cierre): {c.total_ventas_usd}")
        print(f"Fiado USD (cierre): {c.fiado_dia_usd}")

    print("\n=== VENTAS DE HOY (2026-05-22) ===")
    ventas_hoy = Venta.query.filter(db.func.date(Venta.fecha) == '2026-05-22').order_by(Venta.fecha.desc()).all()
    print(f"Total ventas hoy: {len(ventas_hoy)}")
    for v in ventas_hoy[:5]:
        print(f"  Venta ID: {v.id} | Fecha: {v.fecha} | Total USD: {v.total_usd} | Fiado: {v.es_fiado}")

    print("\n=== VENTAS DE AYER (2026-05-21) ===")
    ventas_ayer = Venta.query.filter(db.func.date(Venta.fecha) == '2026-05-21').order_by(Venta.fecha.desc()).all()
    print(f"Total ventas ayer: {len(ventas_ayer)}")
    for v in ventas_ayer[:5]:
        print(f"  Venta ID: {v.id} | Fecha: {v.fecha} | Total USD: {v.total_usd} | Fiado: {v.es_fiado}")
