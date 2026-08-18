import traceback
from app import app
from models import Venta

with app.app_context():
    try:
        print("Querying last 300 sales...")
        ventas = Venta.query.order_by(Venta.id.desc()).limit(300).all()
        print(f"Loaded {len(ventas)} sales. Checking properties...")
        
        for i, v in enumerate(ventas):
            try:
                # Trigger property evaluations
                name = v.nombre_cliente_final
                detalles_count = len(v.detalles)
                for d in v.detalles:
                    prod_name = d.producto.nombre if d.producto else "None"
            except Exception as inner_e:
                print(f"Error on sale ID {v.id} at index {i}:")
                traceback.print_exc()
                raise inner_e
        print("All 300 sales checked successfully! No errors in properties.")
    except Exception as e:
        print("Global error:")
        traceback.print_exc()
