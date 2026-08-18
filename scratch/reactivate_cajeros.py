import sys
import os

sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from app import app
from models import db, User

with app.app_context():
    print("=== REACTIVATING CAJERO ACCOUNTS ===")
    
    # Andrés Eloy (id=251)
    andres = User.query.filter_by(id=251).first()
    if andres:
        andres.activo = True
        print(f"Reactivated: ID={andres.id} | Username={andres.username} | Nombre={andres.nombre_completo} | Rol={andres.role} | Activo={andres.activo}")
    else:
        print("User Andrés Eloy not found by ID=251")
        
    # Diana Aponte (id=252)
    diana = User.query.filter_by(id=252).first()
    if diana:
        diana.activo = True
        print(f"Reactivated: ID={diana.id} | Username={diana.username} | Nombre={diana.nombre_completo} | Rol={diana.role} | Activo={diana.activo}")
    else:
        print("User Diana Aponte not found by ID=252")
        
    db.session.commit()
    print("Database changes committed successfully!")
