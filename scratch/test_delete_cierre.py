import os
import sys

sys.path.append(os.path.abspath(os.path.dirname(__file__) + '/..'))

from app import app
from models import db, CierreCaja

with app.app_context():
    print("=== INTENTANDO ELIMINAR CIERRE 58 ===")
    cierre = CierreCaja.query.get(58)
    if cierre:
        try:
            db.session.delete(cierre)
            db.session.commit()
            print("✅ Cierre 58 eliminado exitosamente en la BD.")
        except Exception as e:
            db.session.rollback()
            print(f"❌ Error al eliminar Cierre 58: {e}")
    else:
        print("ℹ️ Cierre 58 no existe en la BD.")
