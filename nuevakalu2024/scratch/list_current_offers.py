import sys
import os

sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from app import app
from models import db, Producto

with app.app_context():
    offers = Producto.query.filter(Producto.precio_oferta_usd > 0).all()
    print(f"Total productos en oferta: {len(offers)}")
    for p in offers:
        print(f"Cod: {p.codigo:<15} | Nombre: {p.nombre:<35} | Cat: {p.categoria:<15} | Costo: {p.costo_usd:<6} | Oferta: {p.precio_oferta_usd:<6}")
