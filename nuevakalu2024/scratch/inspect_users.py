import os
import sys

sys.path.append(os.path.abspath(os.path.dirname(__file__) + '/..'))

from app import app
from models import db, User

with app.app_context():
    print("=== USUARIOS DEL SISTEMA ===")
    users = User.query.all()
    for u in users:
        print(f"ID: {u.id} | User: {u.username} | Role: {u.role} | Active: {getattr(u, 'activo', True)}")
