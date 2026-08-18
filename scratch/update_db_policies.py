import sys
import os
from decimal import Decimal

sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from app import app
from models import db, Producto, User

# Define allowed categories keywords (case insensitive)
CARB_HARINAS = ['harina', 'arroz', 'pasta', 'fideo', 'spaghetti', 'macarron', 'trigo', 'avena', 'fororo', 'semola', 'pan', 'casabe', 'fideos']
ENDULZ_CAFE = ['azucar', 'edulcorante', 'miel', 'cafe', 'papelon', 'sirope', 'endulzante', 'melaza']

def matches_any(name, keywords):
    name_lower = name.lower()
    for kw in keywords:
        if kw in name_lower:
            return True
    return False

with app.app_context():
    print("=== DEACTIVATING OFFERS FOR PRODUCTS OUTSIDE OF CATEGORIES ===")
    all_products = Producto.query.all()
    on_offer = [p for p in all_products if p.precio_oferta_usd and p.precio_oferta_usd > 0]
    
    deactivated_count = 0
    kept_count = 0
    
    for p in on_offer:
        is_carb = matches_any(p.nombre, CARB_HARINAS)
        is_endulz = matches_any(p.nombre, ENDULZ_CAFE)
        
        if is_carb or is_endulz:
            group = "Carbohidratos y Harinas" if is_carb else "Endulzantes y Cafe"
            print(f"KEEPING OFFER: {p.nombre} (Cod: {p.codigo}) | Grupo: {group} | Oferta: ${p.precio_oferta_usd:.2f}")
            kept_count += 1
        else:
            print(f"DEACTIVATING OFFER: {p.nombre} (Cod: {p.codigo}) | Costo: ${p.costo_usd:.2f} | Oferta fue: ${p.precio_oferta_usd:.2f}")
            p.precio_oferta_usd = Decimal('0.00')
            deactivated_count += 1

    print(f"\nSummary of Offers: Kept {kept_count}, Deactivated {deactivated_count}")
    
    print("\n=== REVOKING USER ACCESS FOR WORKERS ===")
    # Andrés Eloy (id=251, username="31107381")
    andres = User.query.filter_by(id=251).first()
    if andres:
        andres.activo = False
        print(f"User deactivated: ID={andres.id} | Username={andres.username} | Nombre={andres.nombre_completo} | Rol={andres.role} | Activo={andres.activo}")
    else:
        print("User Andrés Eloy not found by ID=251")
        
    # Diana Aponte (id=252, username="28241058")
    diana = User.query.filter_by(id=252).first()
    if diana:
        diana.activo = False
        print(f"User deactivated: ID={diana.id} | Username={diana.username} | Nombre={diana.nombre_completo} | Rol={diana.role} | Activo={diana.activo}")
    else:
        print("User Diana Aponte not found by ID=252")
        
    db.session.commit()
    print("\nDatabase changes successfully committed!")
