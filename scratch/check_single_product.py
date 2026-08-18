import sys
import os
from decimal import Decimal

sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from app import app
from models import db, Producto

with app.app_context():
    prods = Producto.query.filter(Producto.nombre.ilike('%yusty%')).all()
    print(f"Encontrados: {len(prods)}")
    for p in prods:
        print(f"Codigo: {p.codigo} | Nombre: {p.nombre} | Costo: {p.costo_usd} | Precio Oferta: {p.precio_oferta_usd} | Precio Normal: {p.precio_normal_usd}")
