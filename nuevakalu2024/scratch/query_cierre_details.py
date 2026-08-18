import sys
import os
import json

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, CierreCaja

with app.app_context():
    for cid in [57, 58]:
        c = CierreCaja.query.get(cid)
        if not c:
            print(f"Cierre {cid} no encontrado.")
            continue
        print(f"\n=== CIERRE ID: {c.id} ===")
        print(f"Fecha: {c.fecha}")
        print(f"Cajero: {c.cajero_nombre}")
        print(f"Tasa BCV: {c.tasa_cierre}")
        print(f"Esperado USD: {c.monto_usd} | Real USD: {c.monto_real_usd} | Dif USD: {c.diferencia_usd}")
        print(f"Esperado Bs: {c.monto_bs} | Real Bs: {c.monto_real_bs} | Dif Bs: {c.diferencia_bs}")
        print(f"Esperado PM: {c.pago_movil} | Real PM: {c.pago_movil + c.diferencia_bs if c.id == 57 else 'N/A'}")
        print(f"Esperado Tarjeta Debito: {c.tarjeta_debito}")
        print(f"Esperado Pago Movil: {c.pago_movil}")
        print(f"Esperado Biopago: {c.biopago}")
        print(f"Esperado Transferencia: {c.transferencia}")
        print(f"Total Ventas USD: {c.total_ventas_usd}")
        print(f"Total Compras USD: {c.total_compras_usd}")
        print(f"Fiado Dia USD: {c.fiado_dia_usd}")
        print(f"Observaciones: {repr(c.observaciones)}")
        
        # Check associated accounting entries
        from models import Asiento, DetalleAsiento
        asientos = Asiento.query.filter(Asiento.descripcion.like(f"%CIERRE%")).all()
        print(f"Asientos contables relacionados:")
        for a in asientos:
            if str(c.fecha) in a.descripcion or (c.id == 57 and "TEST" in a.descripcion):
                print(f"  Asiento ID: {a.id} | Desc: {a.descripcion} | Ref Tipo: {a.referencia_tipo} | Ref ID: {a.referencia_id}")
                movs = DetalleAsiento.query.filter_by(asiento_id=a.id).all()
                for m in movs:
                    print(f"    Cuenta: {m.cuenta.codigo} ({m.cuenta.nombre}) | Debe USD: {m.debe_usd} | Haber USD: {m.haber_usd} | Debe Bs: {m.debe_bs} | Haber Bs: {m.haber_bs}")
