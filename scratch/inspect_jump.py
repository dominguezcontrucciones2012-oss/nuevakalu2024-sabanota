import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, MovimientoProductor

with app.app_context():
    for mid in [474, 454]:
        m = MovimientoProductor.query.get(mid)
        if m:
            print(f"\n==========================================")
            print(f"DETALLE MOVIMIENTO ID: {m.id}")
            print(f"==========================================")
            for col in m.__table__.columns:
                print(f"{col.name}: {getattr(m, col.name)}")
