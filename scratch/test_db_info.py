from app import app
from models import db, Cliente, Producto, User

with app.app_context():
    print("--- USUARIOS ---")
    for u in User.query.all():
        print(f"ID: {u.id}, Username: {u.username}, Role: {u.role}")

    print("\n--- CLIENTES ---")
    for c in Cliente.query.limit(5).all():
        print(f"ID: {c.id}, Nombre: {c.nombre}, Puntos: {c.puntos}, Premios: {c.premios_pendientes}")

    print("\n--- PRODUCTOS ---")
    for p in Producto.query.limit(5).all():
        print(f"ID: {p.id}, Codigo: {p.codigo}, Nombre: {p.nombre}, Stock: {p.stock}, Precio: {p.precio_venta_usd}")
