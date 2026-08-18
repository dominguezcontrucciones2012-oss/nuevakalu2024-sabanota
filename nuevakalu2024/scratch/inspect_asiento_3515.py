import sys
import os

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Asiento, DetalleAsiento

with app.app_context():
    asiento = Asiento.query.get(3515)
    if asiento:
        print(f"Asiento ID: {asiento.id}")
        print(f"Descripcion: {asiento.descripcion}")
        print(f"Tasa: {asiento.tasa_referencia}")
        print(f"Detalles ({len(asiento.detalles)}):")
        for d in asiento.detalles:
            print(f"  Cuenta: {d.cuenta.codigo} - {d.cuenta.nombre} | Debe USD: {d.debe_usd} | Haber USD: {d.haber_usd} | Debe Bs: {d.debe_bs} | Haber Bs: {d.haber_bs}")
    else:
        print("Asiento 3515 no encontrado.")
