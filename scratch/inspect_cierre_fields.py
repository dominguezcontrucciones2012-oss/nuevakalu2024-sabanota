import sys
import os

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import CierreCaja

with app.app_context():
    c = CierreCaja.query.get(58)
    if c:
        print("=== TODOS LOS CAMPOS DE CIERRE 58 ===")
        for col in c.__table__.columns:
            print(f"{col.name}: {getattr(c, col.name)}")
    else:
        print("No existe el cierre 58.")
