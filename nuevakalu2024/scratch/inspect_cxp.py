import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, CuentaPorPagar, Compra

with app.app_context():
    for pid in [7, 10]:
        print(f"\n==========================================")
        print(f"PRODUCTOR ID: {pid}")
        print(f"==========================================")
        cxps = CuentaPorPagar.query.filter_by(proveedor_id=pid).all()
        print(f"Cuentas por Pagar ({len(cxps)}):")
        for c in cxps:
            print(f"  - ID: {c.id} | Fac: {c.numero_factura} | Fecha: {c.fecha_emision} | Total: {c.monto_total_usd} | Abonado: {c.monto_abonado_usd} | Pendiente: {c.saldo_pendiente_usd} | Estatus: {c.estatus}")
            
        compras = Compra.query.filter_by(proveedor_id=pid).all()
        print(f"Compras ({len(compras)}):")
        for co in compras:
            print(f"  - ID: {co.id} | Fac: {co.numero_factura} | Fecha: {co.fecha} | Total: {co.total_usd} | Estado: {co.estado}")
