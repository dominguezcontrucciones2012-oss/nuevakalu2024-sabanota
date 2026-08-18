import sys
import os

sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from app import app
from models import db, Producto

with app.app_context():
    cats = db.session.query(Producto.categoria).distinct().all()
    print("Categorias:", [c[0] for c in cats])
    
    # query some products that look like basic necessities (harina, arroz, pasta, azucar, cafe, aceite, leche, mantequilla, queso, etc)
    keywords = ['harina', 'arroz', 'pasta', 'azucar', 'cafe', 'aceite', 'leche', 'queso', 'jabon', 'pollo', 'carne']
    print("\nBuscando productos de la canasta basica:")
    for kw in keywords:
        prods = Producto.query.filter(Producto.nombre.ilike(f'%{kw}%')).limit(5).all()
        if prods:
            print(f"- Palabra clave '{kw}':")
            for p in prods:
                print(f"  * {p.nombre} (Cod: {p.codigo}) | Cat: {p.categoria} | Costo: ${p.costo_usd} | PVP: ${p.precio_normal_usd}")
