import sys
import os
from decimal import Decimal

sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from app import app
from models import db, Producto

# Define categories keywords (case insensitive)
CARB_HARINAS = ['harina', 'arroz', 'pasta', 'fideo', 'spaghetti', 'macarron', 'trigo', 'avena', 'fororo', 'semola', 'pan', 'casabe', 'fideos']
ENDULZ_CAFE = ['azucar', 'edulcorante', 'miel', 'cafe', 'papelon', 'sirope', 'endulzante']

def matches_any(name, keywords):
    name_lower = name.lower()
    for kw in keywords:
        if kw in name_lower:
            return True
    return False

with app.app_context():
    all_products = Producto.query.all()
    on_offer = [p for p in all_products if p.precio_oferta_usd and p.precio_oferta_usd > 0]
    
    print(f"Total products in DB: {len(all_products)}")
    print(f"Total products currently on offer: {len(on_offer)}")
    print("\n--- OFFERS TO KEEP (Matching keywords) ---")
    keep_count = 0
    remove_count = 0
    for p in on_offer:
        is_carb = matches_any(p.nombre, CARB_HARINAS)
        is_endulz = matches_any(p.nombre, ENDULZ_CAFE)
        if is_carb or is_endulz:
            group = "Carbohidratos y Harinas" if is_carb else "Endulzantes y Cafe"
            print(f"KEEP [{group}]: Cod: {p.codigo} | {p.nombre} | Costo: {p.costo_usd} | Oferta: {p.precio_oferta_usd}")
            keep_count += 1
        else:
            remove_count += 1
            
    print("\n--- OFFERS TO REMOVE (Not matching keywords) ---")
    for p in on_offer:
        is_carb = matches_any(p.nombre, CARB_HARINAS)
        is_endulz = matches_any(p.nombre, ENDULZ_CAFE)
        if not (is_carb or is_endulz):
            print(f"REMOVE: Cod: {p.codigo} | {p.nombre} | Costo: {p.costo_usd} | Oferta: {p.precio_oferta_usd}")
            
    print(f"\nSummary: Keep {keep_count}, Remove {remove_count}")
