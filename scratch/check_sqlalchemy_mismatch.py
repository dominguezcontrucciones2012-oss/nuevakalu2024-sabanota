import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Proveedor, MovimientoProductor

with app.app_context():
    m = db.session.get(MovimientoProductor, 1274)
    print("Movimiento 1274:")
    print("  proveedor_id:", m.proveedor_id)
    print("  proveedor:", m.proveedor)
    if m.proveedor:
        print("  proveedor.id:", m.proveedor.id)
        print("  proveedor.nombre:", m.proveedor.nombre)
        
    p = db.session.get(Proveedor, 19)
    print("Proveedor 19:")
    print("  p.id:", p.id)
    print("  p.nombre:", p.nombre)
