import sys
import os

sys.path.append(os.path.abspath(os.path.dirname(__file__) + '/..'))

from app import app
from models import db, User, Asiento, CierreCaja

with app.app_context():
    print("=== USERS ===")
    for uid in [252, 234, 230]:
        u = User.query.get(uid)
        if u:
            print(f"ID: {u.id} | Username: {u.username} | Role: {u.role} | Nombre: {u.nombre_completo}")
        else:
            print(f"ID: {uid} | Not found")
            
    print("\n=== CLOSURE 57 (May 21st) DETAILS ===")
    c57 = CierreCaja.query.get(57)
    if c57:
        print(f"ID: {c57.id} | Fecha: {c57.fecha} | Cajero: {c57.cajero_nombre} | Obs: {c57.observaciones}")
        print(f"Real USD: {c57.monto_real_usd} | Real Bs: {c57.monto_real_bs}")
        print(f"Esp USD: {c57.monto_usd} | Esp Bs: {c57.monto_bs}")
        
    print("\n=== ASIENTOS ON MAY 21st ===")
    asientos = Asiento.query.filter(db.func.date(Asiento.fecha) == '2026-05-21').all()
    for a in asientos:
        print(f"ID: {a.id} | Fecha: {a.fecha} | Desc: {a.descripcion} | Ref: {a.referencia_tipo}")
