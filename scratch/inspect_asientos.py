import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Asiento

with app.app_context():
    for aid in [1470, 1471]:
        print(f"\n==========================================")
        print(f"ASIENTO ID: {aid}")
        print(f"==========================================")
        a = Asiento.query.get(aid)
        if not a:
            print("Asiento no encontrado.")
            continue
            
        print(f"Descripcion: {a.descripcion}")
        print(f"Referencia Tipo: {a.referencia_tipo} | Referencia ID: {a.referencia_id}")
        print(f"Fecha Creacion: {a.created_at if hasattr(a, 'created_at') else 'N/A'}")
        
        print("Detalles del Asiento:")
        for det in a.detalles:
            print(f"  - Cuenta ID: {det.cuenta_id} | Cuenta: {det.cuenta.nombre if hasattr(det, 'cuenta') and det.cuenta else 'N/A'} | Debe USD: {det.debe_usd} | Haber USD: {det.haber_usd} | Debe Bs: {det.debe_bs} | Haber Bs: {det.haber_bs}")
