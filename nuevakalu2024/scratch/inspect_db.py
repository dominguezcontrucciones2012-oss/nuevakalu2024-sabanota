import sys
import os
from datetime import datetime

# Add root folder to sys.path to load models
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Proveedor, MovimientoProductor, MovimientoCaja

with app.app_context():
    print("=== PROVEEDORES ===")
    provs = Proveedor.query.all()
    for p in provs:
        print(f"ID: {p.id} | Nombre: {p.nombre} | Saldo Pendiente USD: {p.saldo_pendiente_usd} | Es Productor: {p.es_productor} | Es Obrero: {p.es_obrero}")
        
    print("\n=== RECIENTES MOVIMIENTOS DE TONCO MARTINEZ (ID: 5) ===")
    movs_tonco = MovimientoProductor.query.filter_by(proveedor_id=5).order_by(MovimientoProductor.id.desc()).limit(20).all()
    for m in movs_tonco:
        print(f"ID: {m.id} | Fecha: {m.fecha} | Tipo: {m.tipo} | Desc: {m.descripcion} | Kilos: {m.kilos} | Debe: {m.debe} | Haber: {m.haber} | Saldo Momento: {m.saldo_momento}")

    print("\n=== RECIENTES MOVIMIENTOS DE ANDRES (ANDRES ELOY) ===")
    andres = Proveedor.query.filter(Proveedor.nombre.ilike('%andres%')).first()
    if andres:
        movs_andres = MovimientoProductor.query.filter_by(proveedor_id=andres.id).order_by(MovimientoProductor.id.desc()).limit(20).all()
        for m in movs_andres:
            print(f"ID: {m.id} | Fecha: {m.fecha} | Tipo: {m.tipo} | Desc: {m.descripcion} | Kilos: {m.kilos} | Debe: {m.debe} | Haber: {m.haber} | Saldo Momento: {m.saldo_momento}")
    else:
        print("No se encontró a Andres")
