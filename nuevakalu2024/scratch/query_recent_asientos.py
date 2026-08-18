import sys
import os

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Asiento, DetalleAsiento

with app.app_context():
    asientos = Asiento.query.order_by(Asiento.id.desc()).limit(15).all()
    print("ID | Descripcion | Referencia Tipo | Referencia ID | Fecha")
    print("-" * 100)
    for a in asientos:
        print(f"{a.id} | {a.descripcion} | {a.referencia_tipo} | {a.referencia_id} | {a.fecha}")
        movs = DetalleAsiento.query.filter_by(asiento_id=a.id).all()
        for m in movs:
            print(f"  -> Cuenta: {m.cuenta.codigo} ({m.cuenta.nombre}) | Debe: {m.debe_usd} / {m.debe_bs} | Haber: {m.haber_usd} / {m.haber_bs}")
