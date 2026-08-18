import sys
import os

sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from app import app
from models import db, User

with app.app_context():
    users = User.query.all()
    print("Usuarios registrados:")
    for u in users:
        print(f"ID: {u.id} | Username: {u.username} | Role: {u.role} | Activo: {u.activo} | Nombre: {u.nombre_completo} | Email: {u.email}")
