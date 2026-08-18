import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app
from models import db, Producto

with app.app_context():
    total = Producto.query.count()
    print(f"Total products: {total}")
    cats = db.session.query(Producto.categoria, db.func.count(Producto.id)).group_by(Producto.categoria).all()
    for cat, count in cats:
        print(f"Category: {cat} | Count: {count}")
