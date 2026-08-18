import sys
import os
from datetime import datetime
from decimal import Decimal
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Proveedor, MovimientoProductor

with app.app_context():
    print("REVIRTIENDO PAGO DE 20 DE ANGELITO A RESTA (DEBE) Y RECALCULANDO CRONOLOGICAMENTE...")
    print("=" * 80)
    
    # 1. Revertir el movimiento ID 1062 de Angelito a Debe = 20.00
    pago_20 = MovimientoProductor.query.get(1062)
    if pago_20:
        pago_20.debe = Decimal('20.00')
        pago_20.haber = Decimal('0.00')
        # Limpiar o actualizar la descripcion
        pago_20.descripcion = pago_20.descripcion.replace("[CORREGIDO SIGNOS] ", "")
        print("[OK] Reestablecido el pago de $20.00 de Angelito (ID: 1062) en la columna Debe (resta).")
    else:
        print("[!] No se encontro el movimiento ID: 1062.")
        
    # Hacer flush para asegurar la consistencia en memoria
    db.session.flush()
    
    # 2. Recalcular secuencialmente todos los saldos de todos los productores en orden cronologico
    productores = Proveedor.query.filter(
        (Proveedor.es_productor == True) | (Proveedor.es_obrero == True)
    ).all()
    
    for p in productores:
        # Traer todos los movimientos en orden cronologico estricto (fecha, luego ID)
        movs = MovimientoProductor.query.filter_by(proveedor_id=p.id).order_by(
            MovimientoProductor.fecha.asc(),
            MovimientoProductor.id.asc()
        ).all()
        
        running_balance = Decimal('0.00')
        for m in movs:
            debe = m.debe or Decimal('0.00')
            haber = m.haber or Decimal('0.00')
            running_balance = running_balance + haber - debe
            m.saldo_momento = running_balance
            
        # Actualizar el saldo final del proveedor en su tabla
        p.saldo_pendiente_usd = running_balance
        print(f"  Recalculado productor: {p.nombre:25s} | Saldo Final Cronologico: ${running_balance:+.2f}")
        
    # Guardar cambios
    db.session.commit()
    print("=" * 80)
    print("¡CORRECCION CRONOLOGICA Y REVERSION DEL PAGO DE $20 COMPLETADAS CON EXITO!")
