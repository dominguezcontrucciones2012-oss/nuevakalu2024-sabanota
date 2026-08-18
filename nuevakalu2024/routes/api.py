from flask import Blueprint, jsonify, request
from models import db, Producto, Cliente, Proveedor, MovimientoProductor, TasaBCV, VentaPausada, DetalleVentaPausada, PagoProductor
from decimal import Decimal
from datetime import datetime
from sqlalchemy import func, desc, or_

api_bp = Blueprint('api', __name__, url_prefix='/api')

@api_bp.route('/productos', methods=['GET'])
def get_productos():
    productos = Producto.query.all()
    data = []
    for p in productos:
        data.append({
            'id': f"prod-{p.id}",
            'name': p.nombre,
            'category': p.categoria or 'Fresco',
            'stockKg': float(p.stock) if p.stock else 0,
            'purchasePrice': float(p.costo_usd) if p.costo_usd else 0,
            'sellingPrice': float(p.precio_normal_usd) if p.precio_normal_usd else 0,
            'alertThreshold': float(p.stock_minimo) if p.stock_minimo else 0,
            'agingDays': 0, # Add actual logic if available
            'origin': 'Interno'
        })
    return jsonify(data)

@api_bp.route('/clientes', methods=['GET'])
def get_clientes():
    clientes = Cliente.query.all()
    data = []
    for c in clientes:
        data.append({
            'id': f"cli-{c.id}",
            'name': c.nombre,
            'email': f"{c.cedula}@cliente.com", # Placeholder
            'phone': c.telefono or '',
            'loyaltyPoints': c.puntos or 0,
            'outstandingDebt': float(c.saldo_usd) if c.saldo_usd else 0,
            'rfc': c.cedula
        })
    return jsonify(data)

@api_bp.route('/productores', methods=['GET'])
def get_productores():
    productores = Proveedor.query.filter(or_(Proveedor.es_productor==True, Proveedor.es_obrero==True)).order_by(Proveedor.nombre).all()
    data = []
    for p in productores:
        data.append({
            'id': f"{p.id}",
            'name': p.nombre,
            'category': 'Quesero' if p.es_productor else 'Obrero',
            'contact': p.vendedor_nombre or '',
            'phone': p.telefono or '',
            'email': '',
            'address': p.direccion or '',
            'balanceOwed': float(p.saldo_pendiente_usd) if p.saldo_pendiente_usd else 0,
            'storeDebt': 0 # We could calculate store debt specifically if we had a separate field
        })
    return jsonify(data)

@api_bp.route('/libreta', methods=['GET'])
def get_libreta():
    productores = Proveedor.query.filter(or_(Proveedor.es_productor==True, Proveedor.es_obrero==True)).order_by(Proveedor.nombre).all()
    anio_actual = datetime.utcnow().year
    semana_actual = datetime.utcnow().isocalendar()[1]
    
    tasa = TasaBCV.query.order_by(TasaBCV.id.desc()).first()
    valor_tasa = float(tasa.valor) if tasa else 40.0

    data = {
        'productores_pendientes': [],
        'productores_solventes': [],
        'ranking': [],
        'total_deuda': 0,
        'total_haber': 0,
        'tasa_bcv': valor_tasa
    }
    
    raw_ranking = db.session.query(
        Proveedor.id,
        Proveedor.nombre,
        func.sum(MovimientoProductor.kilos).label('total_kilos'),
        func.count(func.distinct(MovimientoProductor.semana_del_anio)).label('semanas_fiel'),
        func.sum(MovimientoProductor.monto_usd).filter(MovimientoProductor.tipo == 'COMPRA_POS').label('total_compras')
    ).join(MovimientoProductor).filter(MovimientoProductor.anio == anio_actual).group_by(Proveedor.id).order_by(desc('total_kilos')).all()
    
    ranking_map = {}
    for r in raw_ranking:
        kilos = r.total_kilos or Decimal('0')
        semanas = int(r.semanas_fiel or 0)
        compras = r.total_compras or Decimal('0')
        puntos = int((kilos / 10) + (Decimal(str(semanas)) * 10) + (compras / 5))
        ranking_map[r.id] = puntos
        data['ranking'].append({
            'nombre': r.nombre,
            'total_kilos': float(kilos),
            'semanas_fiel': semanas,
            'puntos_totales': puntos
        })

    for p in productores:
        total_anio = db.session.query(func.sum(MovimientoProductor.kilos)).filter(
            MovimientoProductor.proveedor_id == p.id,
            MovimientoProductor.tipo == 'ENTREGA_QUESO',
            MovimientoProductor.anio == anio_actual
        ).scalar() or Decimal('0')

        kilos_semana = db.session.query(func.sum(MovimientoProductor.kilos)).filter(
            MovimientoProductor.proveedor_id == p.id,
            MovimientoProductor.tipo == 'ENTREGA_QUESO',
            MovimientoProductor.anio == anio_actual,
            MovimientoProductor.semana_del_anio == semana_actual
        ).scalar() or Decimal('0')
        
        prod_data = {
            'id': f"{p.id}",
            'name': p.nombre,
            'contact': p.vendedor_nombre or 'Sin contacto',
            'phone': p.vendedor_telefono or p.telefono or '',
            'address': p.direccion or '',
            'balanceOwed': float(p.saldo_pendiente_usd) if p.saldo_pendiente_usd else 0,
            'total_kilos_anio': float(total_anio),
            'kilos_semana': float(kilos_semana),
            'ranking_puntos': ranking_map.get(p.id, 0)
        }
        
        if abs(p.saldo_pendiente_usd or Decimal('0')) >= Decimal('0.01'):
            data['productores_pendientes'].append(prod_data)
        else:
            data['productores_solventes'].append(prod_data)
            
        if (p.saldo_pendiente_usd or Decimal('0')) > 0:
            data['total_deuda'] += float(p.saldo_pendiente_usd)
        elif (p.saldo_pendiente_usd or Decimal('0')) < 0:
            data['total_haber'] += float(abs(p.saldo_pendiente_usd))

    return jsonify(data)

@api_bp.route('/pos/pausadas', methods=['GET'])
def get_pausadas():
    pausadas = VentaPausada.query.order_by(VentaPausada.fecha.desc()).all()
    res = []
    for p in pausadas:
        res.append({
            'id': p.id,
            'fecha': p.fecha.strftime('%d/%m %H:%M'),
            'cliente': p.cliente_nombre_manual or (p.cliente.nombre if p.cliente else "Desconocido"),
            'cliente_id': p.cliente_id,
            'cliente_tipo': p.cliente_tipo,
            'total': float(p.total_usd),
            'items_count': len(p.detalles),
            'cajero': p.user.username if p.user else "N/A"
        })
    return jsonify(res)

@api_bp.route('/pos/pausar', methods=['POST'])
def pausar_venta():
    try:
        data = request.get_json()
        if not data.get('items') or len(data['items']) == 0:
            return jsonify({'success': False, 'message': 'Nada que pausar.'})

        cliente_id = data.get('cliente_id')
        cliente_nombre = data.get('cliente_nombre', 'Consumidor Final')
        total = Decimal(str(data.get('total', 0)))

        nueva_pausa = VentaPausada(
            cliente_id=int(cliente_id) if cliente_id else None,
            cliente_nombre_manual=cliente_nombre,
            total_usd=total,
            user_id=1 # Default user since API is stateless for now
        )
        db.session.add(nueva_pausa)
        db.session.flush()

        for item in data['items']:
            nuevo_detalle = DetalleVentaPausada(
                venta_pausada_id=nueva_pausa.id,
                producto_id=int(str(item['productId']).replace('prod-', '')),
                cantidad=Decimal(str(item['quantityKg'])),
                precio_unitario_usd=Decimal(str(item['pricePerKg']))
            )
            db.session.add(nuevo_detalle)

        db.session.commit()
        return jsonify({'success': True, 'message': 'Venta pausada.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})

@api_bp.route('/pos/recuperar/<int:id>', methods=['GET'])
def recuperar_pausada(id):
    try:
        p = VentaPausada.query.get_or_404(id)
        items = []
        for d in p.detalles:
            items.append({
                'productId': f"prod-{d.producto_id}",
                'name': d.producto.nombre,
                'pricePerKg': float(d.precio_unitario_usd),
                'quantityKg': float(d.cantidad),
                'subtotal': float(d.precio_unitario_usd * d.cantidad)
            })
        
        return jsonify({
            'success': True,
            'cliente_id': p.cliente_id,
            'cliente_nombre': p.cliente_nombre_manual,
            'items': items
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@api_bp.route('/pos/pausadas/<int:id>', methods=['DELETE'])
def eliminar_pausada(id):
    try:
        p = VentaPausada.query.get_or_404(id)
        db.session.delete(p)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Venta pausada eliminada.'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@api_bp.route('/libreta/entrega', methods=['POST'])
def registrar_entrega():
    try:
        data = request.json
        proveedor_id = data.get('proveedor_id')
        kilos = Decimal(str(data.get('kilos')))
        precio = Decimal(str(data.get('precio')))
        metodo_pago = data.get('metodo_pago')
        monto_pagado = Decimal(str(data.get('monto_pagado', '0')))
        
        proveedor = Proveedor.query.get_or_404(proveedor_id)
        total = kilos * precio
        
        # Incrementar deuda (saldo positivo a favor del proveedor)
        proveedor.saldo_pendiente_usd = (proveedor.saldo_pendiente_usd or Decimal('0')) + total
        
        mov = MovimientoProductor(
            proveedor_id=proveedor.id,
            tipo='ENTREGA_QUESO',
            descripcion=f'Arrime {kilos}kg a ${precio}/kg',
            kilos=kilos,
            monto_usd=total,
            haber=total,  # A favor del proveedor
            saldo_momento=proveedor.saldo_pendiente_usd
        )
        db.session.add(mov)
        
        # Si se pagó una parte en el momento (que no sea CREDITO)
        if metodo_pago != 'CREDITO' and monto_pagado > 0:
            proveedor.saldo_pendiente_usd -= monto_pagado
            
            pago = PagoProductor(
                proveedor_id=proveedor.id,
                monto_usd=monto_pagado,
                metodo=metodo_pago,
                descripcion='Abono en Arrime de Queso'
            )
            db.session.add(pago)
            
            mov_pago = MovimientoProductor(
                proveedor_id=proveedor.id,
                tipo='PAGO_CRUCE',
                descripcion=f'Pago Inmediato con {metodo_pago}',
                monto_usd=monto_pagado,
                debe=monto_pagado, # En contra del proveedor (se le pagó)
                saldo_momento=proveedor.saldo_pendiente_usd
            )
            db.session.add(mov_pago)
            
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})

@api_bp.route('/libreta/compensar', methods=['POST'])
def compensar_cuentas():
    try:
        data = request.json
        proveedor_id = data.get('proveedor_id')
        monto_pagado = Decimal(str(data.get('monto_pagado', '0')))
        metodo_pago = data.get('metodo_pago')
        
        proveedor = Proveedor.query.get_or_404(proveedor_id)
        saldo_actual = proveedor.saldo_pendiente_usd or Decimal('0')
        
        if monto_pagado <= 0:
            return jsonify({'success': False, 'message': 'Monto inválido.'})
            
        if saldo_actual > 0:
            # Nosotros le debemos a él -> Al pagarle, el saldo disminuye
            proveedor.saldo_pendiente_usd -= monto_pagado
            tipo_mov = 'PAGO_A_PRODUCTOR'
            debe = monto_pagado
            haber = Decimal('0')
            desc = f'Pago con {metodo_pago}'
        else:
            # Él nos debe a nosotros (saldo negativo) -> Él nos paga a nosotros, el saldo aumenta (acercándose a 0)
            proveedor.saldo_pendiente_usd += monto_pagado
            tipo_mov = 'ABONO_DE_PRODUCTOR'
            debe = Decimal('0')
            haber = monto_pagado
            desc = f'Abono del productor con {metodo_pago}'
            
        pago = PagoProductor(
            proveedor_id=proveedor.id,
            monto_usd=monto_pagado,
            metodo=metodo_pago,
            descripcion=desc
        )
        db.session.add(pago)
        
        mov = MovimientoProductor(
            proveedor_id=proveedor.id,
            tipo='PAGO_CRUCE',
            descripcion=desc,
            monto_usd=monto_pagado,
            debe=debe,
            haber=haber,
            saldo_momento=proveedor.saldo_pendiente_usd
        )
        db.session.add(mov)
        
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})

@api_bp.route('/libreta/consumo', methods=['POST'])
def registrar_consumo():
    try:
        data = request.json
        proveedor_id = data.get('proveedor_id')
        monto_deuda = Decimal(str(data.get('monto_deuda', '0')))
        
        if monto_deuda <= 0:
            return jsonify({'success': False, 'message': 'Monto inválido.'})
            
        proveedor = Proveedor.query.get_or_404(proveedor_id)
        
        # El consumo en tienda se resta del saldo a favor del productor
        # (O aumenta su deuda si ya está en negativo)
        proveedor.saldo_pendiente_usd = (proveedor.saldo_pendiente_usd or Decimal('0')) - monto_deuda
        
        mov = MovimientoProductor(
            proveedor_id=proveedor.id,
            tipo='CONSUMO_TIENDA',
            descripcion='Consumo de productos en POS',
            monto_usd=monto_deuda,
            debe=monto_deuda, # A cargo del productor
            saldo_momento=proveedor.saldo_pendiente_usd
        )
        db.session.add(mov)
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})
