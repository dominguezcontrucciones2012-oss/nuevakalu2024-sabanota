import sys
import os
from datetime import datetime
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Compra, CuentaPorPagar, Asiento

with app.app_context():
    print("BUSCANDO COMPRAS, CXP Y ASIENTOS DE QUESO ALREDEDOR DEL 10 DE ABRIL DE 2026...")
    print("=" * 80)
    
    # Buscar Compras
    compras = Compra.query.filter(
        (Compra.fecha >= datetime(2026, 4, 8)) & (Compra.fecha <= datetime(2026, 4, 12))
    ).all()
    print(f"Compras encontradas ({len(compras)}):")
    for c in compras:
        print(f"  - ID: {c.id} | Prov: {c.proveedor.nombre} | Fac: {c.numero_factura} | Total: {c.total_usd} | Estado: {c.estado} | Fecha: {c.fecha}")
        
    # Buscar Cuentas por Pagar
    cxps = CuentaPorPagar.query.filter(
        (CuentaPorPagar.fecha >= datetime(2026, 4, 8)) & (CuentaPorPagar.fecha <= datetime(2026, 4, 12))
    ).all()
    print(f"\nCuentas por Pagar encontradas ({len(cxps)}):")
    for cx in cxps:
        print(f"  - ID: {cx.id} | Prov: {cx.proveedor.nombre} | Fac: {cx.numero_factura} | Total: {cx.monto_total_usd} | Pendiente: {cx.saldo_pendiente_usd} | Fecha: {cx.fecha}")
        
    # Buscar Asientos
    asientos = Asiento.query.filter(
        (Asiento.descripcion.like('%124.5%')) | (Asiento.descripcion.like('%24.9%'))
    ).all()
    print(f"\nAsientos encontrados ({len(asientos)}):")
    for a in asientos:
        ref_date = a.created_at if hasattr(a, 'created_at') else 'N/A'
        print(f"  - ID: {a.id} | Desc: {a.descripcion} | Ref Tipo: {a.referencia_tipo} | Ref ID: {a.referencia_id} | Fecha: {ref_date}")
