import sys
import os

sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

if sys.platform.startswith('win'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from app import app
from models import db, Producto

with app.app_context():
    print("=== PRODUCTOS EN OFERTA CON PRECIO MENOR AL COSTO (COMPRA) ===")
    
    # Query products with an active offer and where the offer is less than the cost
    # We query all and filter in python to handle decimals or database specifics cleanly,
    # or we can do filter in query: Producto.precio_oferta_usd > 0
    ofertas = Producto.query.filter(Producto.precio_oferta_usd > 0).all()
    
    anomalies = []
    for prod in ofertas:
        if prod.precio_oferta_usd < prod.costo_usd:
            anomalies.append(prod)
            
    print(f"Total de productos en conflicto: {len(anomalies)}\n")
    
    print(f"{'Codigo':<15} | {'Nombre':<40} | {'Costo (Compra)':<15} | {'Precio Oferta':<15}")
    print("-" * 90)
    
    for prod in anomalies:
        name_clean = prod.nombre.encode('ascii', errors='ignore').decode('ascii')
        print(f"{prod.codigo:<15} | {name_clean[:40]:<40} | {prod.costo_usd:<15} | {prod.precio_oferta_usd:<15}")
        
    print("\n============================================================")
