import time
import traceback
from app import app
from flask import render_template
from models import Venta, DetalleVenta
from sqlalchemy.orm import joinedload

with app.test_request_context():
    try:
        print("--- TESTING LAZY LOADING ---")
        start = time.time()
        ventas_lazy = Venta.query.order_by(Venta.id.desc()).limit(300).all()
        rendered_lazy = render_template('historial_ventas.html', ventas=ventas_lazy)
        lazy_time = time.time() - start
        print(f"Lazy loading took {lazy_time:.4f} seconds (HTML size: {len(rendered_lazy)})")

        print("--- TESTING EAGER LOADING ---")
        start = time.time()
        ventas_eager = Venta.query.options(
            joinedload(Venta.cliente),
            joinedload(Venta.detalles).joinedload(DetalleVenta.producto)
        ).order_by(Venta.id.desc()).limit(300).all()
        rendered_eager = render_template('historial_ventas.html', ventas=ventas_eager)
        eager_time = time.time() - start
        print(f"Eager loading took {eager_time:.4f} seconds (HTML size: {len(rendered_eager)})")

    except Exception as e:
        traceback.print_exc()
