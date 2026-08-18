import traceback
from app import app
from flask import render_template
from models import Venta

with app.test_request_context():
    try:
        print("Querying last 300 sales...")
        ventas = Venta.query.order_by(Venta.id.desc()).limit(300).all()
        print(f"Loaded {len(ventas)} sales. Attempting to render template...")
        
        # Render the template in test request context
        rendered = render_template('historial_ventas.html', ventas=ventas)
        print("Template rendered successfully! Size of HTML:", len(rendered))
    except Exception as e:
        print("\n!!! ERROR RENDERING TEMPLATE !!!")
        traceback.print_exc()
