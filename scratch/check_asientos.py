import sys
import os
from datetime import datetime, date

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Asiento, MovimientoCaja, CierreCaja

with app.app_context():
    target_date = date(2026, 5, 22)
    print("=== ASIENTOS CONTABLES DE HOY ===")
    asientos = Asiento.query.filter(db.func.date(Asiento.fecha) == target_date).all()
    for a in asientos:
        print(f"ID: {a.id} | Fecha: {a.fecha} | Desc: {a.descripcion} | Ref Tipo: {a.referencia_tipo}")
        
    print("\n=== CIERRE CAJA DETALLES ===")
    cierre = CierreCaja.query.filter_by(fecha=target_date).first()
    if cierre:
        print(f"Cierre ID: {cierre.id} | Fecha: {cierre.fecha}")
        # Note: we don't have a datetime on CierreCaja itself, but let's check if there's any other indicator.
        # Let's check the date of the last MovimientoCaja of category 'Cierre' or similar, or just check the Asiento with reference_tipo='CIERRE_AJUSTE'.
        
    print("\n=== MOVIMIENTOS DE CAJA DE AJUSTE CIERRE ===")
    movs = MovimientoCaja.query.filter(
        db.func.date(MovimientoCaja.fecha) == target_date,
        MovimientoCaja.descripcion.ilike('%cierre%')
    ).all()
    for m in movs:
        print(f"ID: {m.id} | Fecha: {m.fecha} | Desc: {m.descripcion} | Monto: {m.monto}")
