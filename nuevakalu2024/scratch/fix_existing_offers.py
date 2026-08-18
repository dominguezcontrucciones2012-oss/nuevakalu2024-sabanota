import sys
import os
from decimal import Decimal

sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from app import app
from models import db, Producto

with app.app_context():
    print("=== INICIANDO CORRECCIÓN DE PRECIOS DE OFERTA ===")
    
    # Query all products with an active offer
    ofertas = Producto.query.filter(Producto.precio_oferta_usd > 0).all()
    
    corregidos = 0
    for prod in ofertas:
        cost = prod.costo_usd or Decimal('0.00')
        offer = prod.precio_oferta_usd or Decimal('0.00')
        
        # Calculate minimum allowed offer (15% profit over cost)
        minimo_permitido = (cost * Decimal('1.15')).quantize(Decimal('0.01'))
        
        if offer < minimo_permitido:
            # We fix it by setting it to the minimum allowed price (cost * 1.15)
            prod.precio_oferta_usd = minimo_permitido
            name_clean = prod.nombre.encode('ascii', errors='ignore').decode('ascii')
            print(f"Corrigiendo {prod.codigo:<15} | {name_clean[:35]:<35} | Costo: {cost:<6} | Oferta anterior: {offer:<6} -> Nueva oferta: {minimo_permitido:<6}")
            corregidos += 1
            
    if corregidos > 0:
        db.session.commit()
        print(f"\n¡Se corrigieron {corregidos} productos con éxito!")
    else:
        print("\nNo se encontraron productos que violen la regla de ganancia mínima de 15%.")
