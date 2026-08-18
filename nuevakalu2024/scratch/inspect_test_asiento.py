import sys
import os
from datetime import datetime, date

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Asiento, User

with app.app_context():
    print("=== ASIENTOS CREADOS O FECHADOS EL 2026-05-21 ===")
    asientos = Asiento.query.filter(
        (db.func.date(Asiento.fecha) == '2026-05-21') |
        (Asiento.descripcion.like('%2026-05-21%')) |
        (Asiento.referencia_tipo == 'TEST')
    ).all()
    for a in asientos:
        print(f"ID: {a.id}")
        print(f"  Fecha: {a.fecha}")
        print(f"  Referencia Tipo: {a.referencia_tipo}")
        print(f"  Referencia ID: {a.referencia_id}")
        print(f"  Descripcion: {a.descripcion}")
        print(f"  Usuario ID: {a.user_id}")
        if a.user:
            print(f"  Usuario Username: {a.user.username}")
        print("  Detalles:")
        for d in a.detalles:
            print(f"    Cuenta: {d.cuenta.codigo if d.cuenta else 'None'} | Debe USD: {d.debe_usd} | Haber USD: {d.haber_usd} | Debe Bs: {d.debe_bs} | Haber Bs: {d.haber_bs}")
        print("-" * 50)
