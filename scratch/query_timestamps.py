import sys
import os

sys.path.append(os.path.abspath(os.path.dirname(__file__) + '/..'))

from app import app
from models import db, CierreCaja, Asiento, MovimientoCaja

with app.app_context():
    print("=== ASIENTOS CREATED RECENTLY ===")
    asientos = Asiento.query.order_by(Asiento.id.desc()).limit(20).all()
    for a in asientos:
        print(f"ID: {a.id} | Fecha: {a.fecha} | Desc: {a.descripcion} | Ref: {a.referencia_tipo} | User ID: {a.user_id}")
        
    print("\n=== MOVIMIENTOS DE CAJA DE HOY Y AYER ===")
    movs = MovimientoCaja.query.filter(MovimientoCaja.fecha >= '2026-05-21').order_by(MovimientoCaja.id.desc()).limit(20).all()
    for m in movs:
        print(f"ID: {m.id} | Fecha: {m.fecha} | Caja: {m.tipo_caja} | Tipo: {m.tipo_movimiento} | Cat: {m.categoria} | Monto: {m.monto} | Desc: {m.descripcion} | User: {m.user_id}")
