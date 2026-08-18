import sys
import os
from datetime import datetime
from decimal import Decimal
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Proveedor, MovimientoProductor, Asiento

with app.app_context():
    print("INICIANDO APLICACION DE CORRECCIONES EN BASE DE DATOS...")
    print("=" * 80)
    
    # 1. Insertar entrega de queso faltante para Angelito (ID: 10)
    # Buscamos si ya se insertó (para evitar duplicados al re-ejecutar)
    exist_angelito = MovimientoProductor.query.filter_by(
        proveedor_id=10,
        tipo='ENTREGA_QUESO',
        kilos=24.9
    ).first()
    
    if not exist_angelito:
        m_angelito = MovimientoProductor(
            proveedor_id=10,
            tipo='ENTREGA_QUESO',
            descripcion='[AUDITORIA] Entrega de Queso 24.9kg (Asiento Contable 1470)',
            kilos=Decimal('24.9'),
            haber=Decimal('124.50'),
            debe=Decimal('0.00'),
            fecha=datetime(2026, 4, 11, 10, 0, 0),
            anio=2026,
            semana_del_anio=15
        )
        db.session.add(m_angelito)
        print("[OK] Insertado movimiento faltante de entrega de queso para Angelito ($124.50).")
    else:
        print("- El movimiento de entrega de queso para Angelito ya existe.")
        
    # 2. Insertar entrega de queso faltante para Marcos Corro (ID: 7)
    exist_marcos = MovimientoProductor.query.filter_by(
        proveedor_id=7,
        tipo='ENTREGA_QUESO',
        kilos=24.9
    ).first()
    
    if not exist_marcos:
        m_marcos = MovimientoProductor(
            proveedor_id=7,
            tipo='ENTREGA_QUESO',
            descripcion='[AUDITORIA] Entrega de Queso 24.9kg (Asiento Contable 1471)',
            kilos=Decimal('24.9'),
            haber=Decimal('124.50'),
            debe=Decimal('0.00'),
            fecha=datetime(2026, 4, 10, 10, 0, 0),
            anio=2026,
            semana_del_anio=15
        )
        db.session.add(m_marcos)
        print("[OK] Insertado movimiento faltante de entrega de queso para Marcos Corro ($124.50).")
    else:
        print("- El movimiento de entrega de queso para Marcos Corro ya existe.")
        
    # 3. Corregir pago de 20 USD de Angelito (ID: 1062)
    pago_20 = MovimientoProductor.query.get(1062)
    if pago_20 and float(pago_20.debe) == 20.00:
        pago_20.haber = Decimal('20.00')
        pago_20.debe = Decimal('0.00')
        pago_20.descripcion = "[CORREGIDO SIGNOS] " + (pago_20.descripcion or '')
        print("[OK] Corregido pago de $20.00 de Angelito (ID: 1062) a Haber.")
    else:
        print("- El pago de $20.00 de Angelito (ID: 1062) ya esta corregido o no se encontro.")
        
    # 4. Corregir sistemáticamente todos los ABONO_POS registrados como Debe
    abonos_pos = MovimientoProductor.query.filter_by(tipo='ABONO_POS').all()
    corrected_abonos_count = 0
    for ab in abonos_pos:
        if ab.debe > 0 and ab.haber == 0:
            ab.haber = ab.debe
            ab.debe = Decimal('0.00')
            ab.descripcion = "[CORREGIDO SIGNOS] " + (ab.descripcion or '')
            corrected_abonos_count += 1
            
    print(f"[OK] Corregidos {corrected_abonos_count} registros de ABONO_POS de Debe a Haber.")
    
    # Hacer flush para asegurar que los nuevos registros tengan ID y estén listos
    db.session.flush()
    
    # 5. Recalcular saldo_momento y actualizar Proveedor.saldo_pendiente_usd para todos los productores
    productores = Proveedor.query.filter(
        (Proveedor.es_productor == True) | (Proveedor.es_obrero == True)
    ).all()
    
    for p in productores:
        # Traer todos los movimientos en orden cronológico estricto
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
            
        # Actualizar el saldo en el modelo Proveedor
        p.saldo_pendiente_usd = running_balance
        print(f"  Recalculado productor: {p.nombre:25s} | Saldo Final Corregido: ${running_balance:+.2f}")
        
    # Guardar todos los cambios permanentemente en la base de datos
    db.session.commit()
    print("=" * 80)
    print("CORRECCION COMPLETA APLICADA EXITOSAMENTE EN LA BASE DE DATOS!")
