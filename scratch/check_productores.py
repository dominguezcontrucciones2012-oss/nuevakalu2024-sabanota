import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Proveedor, MovimientoProductor

with app.app_context():
    print("=== BUSCANDO PRODUCTORES ===")
    productores = Proveedor.query.filter(
        (Proveedor.nombre.ilike('%angelito%')) | 
        (Proveedor.nombre.ilike('%marcos%')) | 
        (Proveedor.nombre.ilike('%corro%'))
    ).all()
    
    if not productores:
        print("No se encontraron productores con esos nombres. Buscando todos los proveedores...")
        productores = Proveedor.query.all()
        for p in productores:
            print(f"ID: {p.id} | Nombre: {p.nombre} | RIF: {p.rif} | Productor: {p.es_productor} | Saldo: {p.saldo_pendiente_usd}")
    else:
        for p in productores:
            print(f"\nID: {p.id} | Nombre: {p.nombre} | RIF: {p.rif} | Saldo actual: {p.saldo_pendiente_usd}")
            print("--- MOVIMIENTOS RECIENTES ---")
            movs = MovimientoProductor.query.filter_by(proveedor_id=p.id).order_by(MovimientoProductor.fecha.desc()).limit(15).all()
            for m in movs:
                print(f"  Mov ID: {m.id} | Fecha: {m.fecha} | Tipo: {m.tipo} | Desc: {m.descripcion} | Monto USD: {m.monto_usd} | Debe: {m.debe} | Haber: {m.haber} | Saldo Momento: {m.saldo_momento}")
