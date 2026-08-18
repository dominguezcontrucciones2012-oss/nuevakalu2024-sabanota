import sys
import os
import sqlite3

# Add root folder to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Proveedor, MovimientoProductor, Compra, CuentaPorPagar

with app.app_context():
    print("=== PROVEEDOR NAMES AND IDS ===")
    for p in Proveedor.query.all():
        print(f"ID: {p.id:2d} | Nombre: {p.nombre}")

    print("\n=== ALL MOVEMENTS FROM MAY 18 AND MAY 19 ===")
    movs = MovimientoProductor.query.filter(MovimientoProductor.fecha >= '2026-05-18 00:00:00').order_by(MovimientoProductor.id.desc()).all()
    for m in movs:
        p_name = m.proveedor.nombre if m.proveedor else "Unknown"
        print(f"ID: {m.id} | ProvID: {m.proveedor_id} ({p_name}) | Fecha: {m.fecha} | Tipo: {m.tipo} | Desc: {m.descripcion} | Kilos: {m.kilos} | Debe: {m.debe} | Haber: {m.haber} | SaldoMomento: {m.saldo_momento}")
        
    print("\n=== SEARCH FOR ANY DELETED / AUDIT LOG OF DELETIONS / SCRIPT LOGS IN CODEBASE ===")
    # Let's check if there are other files in workspace that could show a log of recent deletions
