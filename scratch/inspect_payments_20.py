import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, MovimientoProductor

with app.app_context():
    print("INSIDE PAYMENTS OF ~20 USD FOR ANGELITO AND MARCOS CORRO...")
    print("=" * 80)
    
    for pid, name in [(7, "MARCOS CORRO"), (10, "ANGELITO")]:
        print(f"\nProductor: {name} (ID: {pid})")
        movs = MovimientoProductor.query.filter(
            MovimientoProductor.proveedor_id == pid,
            (
                (MovimientoProductor.debe >= 19.0) & (MovimientoProductor.debe <= 21.0) |
                (MovimientoProductor.haber >= 19.0) & (MovimientoProductor.haber <= 21.0)
            )
        ).all()
        
        for m in movs:
            print(f"  - ID: {m.id} | Tipo: {m.tipo} | Debe: {m.debe} | Haber: {m.haber} | Saldo Reg: {m.saldo_momento} | Desc: {m.descripcion} | Fecha: {m.fecha}")
