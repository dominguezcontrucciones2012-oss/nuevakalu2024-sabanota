import sys
import os

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, CierreCaja

with app.app_context():
    cierres = CierreCaja.query.order_by(CierreCaja.id.desc()).limit(10).all()
    print("ID | Fecha | Cajero | Real USD | Real Bs | Obs | Tasa | Ventas USD | Compras USD | Fiado USD")
    print("-" * 100)
    for c in cierres:
        print(f"{c.id} | {c.fecha} | {c.cajero_nombre} | {c.monto_real_usd} | {c.monto_real_bs} | {repr(c.observaciones)} | {c.tasa_cierre} | {c.total_ventas_usd} | {c.total_compras_usd} | {c.fiado_dia_usd}")
