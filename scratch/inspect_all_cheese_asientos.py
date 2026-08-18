import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Asiento

with app.app_context():
    print("INSIDE ALL CHEESE COMPENSATIONS (COMPRA_QUESO ASIENTOS)...")
    print("=" * 80)
    
    asientos = Asiento.query.filter(
        (Asiento.referencia_tipo == 'COMPRA_QUESO') | 
        (Asiento.descripcion.like('%COMPRA QUESO%'))
    ).order_by(Asiento.id.asc()).all()
    
    print(f"Total Asientos de Compra de Queso: {len(asientos)}")
    for a in asientos:
        print(f"\nID: {a.id} | Desc: {a.descripcion} | Ref: {a.referencia_tipo} ({a.referencia_id})")
        for det in a.detalles:
            print(f"  - Cuenta ID: {det.cuenta_id} | Cuenta: {det.cuenta.nombre if hasattr(det, 'cuenta') and det.cuenta else 'N/A'} | Debe: {det.debe_usd} | Haber: {det.haber_usd}")
