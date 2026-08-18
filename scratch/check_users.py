import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app
from models import db, User

with app.app_context():
    users = User.query.all()
    print("=== TODOS LOS USUARIOS ===")
    for u in users:
        print(f"ID: {u.id} | Username: {u.username} | Role: {u.role} | Activo: {u.activo}")
