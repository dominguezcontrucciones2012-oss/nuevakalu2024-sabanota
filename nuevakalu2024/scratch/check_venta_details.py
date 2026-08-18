import sys
import os

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import Venta, MovimientoProductor

with app.app_context():
    v = Venta.query.get(2943)
    if v:
        print(f"Venta 2943 - Nombre Cliente Final: {v.nombre_cliente_final}")
        mov = MovimientoProductor.query.filter(
            MovimientoProductor.tipo == 'COMPRA_POS',
            MovimientoProductor.descripcion.like(f'%#{v.id}%')
        ).first()
        if mov:
            print(f"MovimientoProductor asociado: ID={mov.id}, Proveedor={mov.proveedor.nombre if mov.proveedor else 'N/A'}")
        else:
            print("No hay MovimientoProductor asociado.")
    else:
        print("Venta 2943 no encontrada.")
