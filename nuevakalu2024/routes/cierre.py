from flask import Blueprint, render_template, redirect, url_for, flash, jsonify, request
from flask_login import login_required, current_user
from routes.decorators import staff_required
from models import db, Venta, DetalleVenta, TasaBCV, CierreCaja, Asiento, MovimientoCaja, Compra, CompraDetalle, HistorialPago, MovimientoProductor, Proveedor
from datetime import datetime
from decimal import Decimal
from utils import seguro_decimal
from sqlalchemy import func, or_
from sqlalchemy.orm import joinedload
import json
import logging
from routes.contabilidad import registrar_asiento

logger = logging.getLogger('KALU.cierre')
cierre_bp = Blueprint('cierre', __name__)

def _generar_json_detalles(fecha):
    ventas_dia = Venta.query.filter(func.date(Venta.fecha) == fecha)\
        .options(joinedload(Venta.detalles).joinedload(DetalleVenta.producto)).all()
    
    abonos_dia = HistorialPago.query.filter(func.date(HistorialPago.fecha) == fecha).all()
    
    compras_dia = Compra.query.filter(func.date(Compra.fecha) == fecha)\
        .options(joinedload(Compra.detalles).joinedload(CompraDetalle.producto)).all()

    lista_ventas = []
    for v in ventas_dia:
        v_hora = v.fecha.strftime('%I:%M %p') if v.fecha else 'S/F'
        lista_ventas.append({
            'id': v.id,
            'hora': v_hora,
            'cliente': v.nombre_cliente_final if hasattr(v, 'nombre_cliente_final') else (v.cliente.nombre if v.cliente else 'Consumidor Final'),
            'total_usd': str(seguro_decimal(v.total_usd)),
            'efectivo_usd': str(seguro_decimal(v.pago_efectivo_usd)),
            'efectivo_bs': str(seguro_decimal(v.pago_efectivo_bs)),
            'pago_movil': str(seguro_decimal(v.pago_movil_bs)),
            'debito': str(seguro_decimal(v.pago_debito_bs)),
            'transferencia': str(seguro_decimal(v.pago_transferencia_bs)),
            'biopago': str(seguro_decimal(v.biopago_bdv)),
            'fiado': v.es_fiado,
            'saldo_pendiente': str(seguro_decimal(v.saldo_pendiente_usd)),
            'productos': [{'nombre': d.producto.nombre if d.producto else 'Producto Eliminado', 
                           'cantidad': str(d.cantidad), 
                           'precio': str(d.precio_unitario_usd)} for d in v.detalles]
        })

    for a in abonos_dia:
        if a.metodo_pago == 'ABONO INICIAL': continue
        a_hora = a.fecha.strftime('%I:%M %p') if a.fecha else 'S/F'
        lista_ventas.append({
            'id': f"ABONO-{a.id}",
            'hora': a_hora,
            'cliente': f"ABONO: {a.cliente.nombre if a.cliente else 'S/N'}",
            'total_usd': str(seguro_decimal(a.monto_usd)),
            'efectivo_usd': str(seguro_decimal(a.monto_usd) if a.metodo_pago == 'EFECTIVO_USD' else Decimal('0.00')),
            'efectivo_bs': str(seguro_decimal(a.monto_bs) if a.metodo_pago == 'EFECTIVO_BS' else Decimal('0.00')),
            'pago_movil': str(seguro_decimal(a.monto_bs) if a.metodo_pago == 'PAGO_MOVIL' else Decimal('0.00')),
            'debito': str(seguro_decimal(a.monto_bs) if a.metodo_pago == 'DEBITO' else Decimal('0.00')),
            'transferencia': str(seguro_decimal(a.monto_bs) if a.metodo_pago == 'TRANSFERENCIA' else Decimal('0.00')),
            'biopago': str(seguro_decimal(a.monto_bs) if a.metodo_pago == 'BIOPAGO' else Decimal('0.00')),
            'fiado': False, 'saldo_pendiente': '0.00',
            'productos': [{'nombre': 'ABONO DE DEUDA', 'cantidad': '1.00', 'precio': str(seguro_decimal(a.monto_usd))}]
        })

    lista_compras = []
    for c in compras_dia:
        c_hora = c.fecha.strftime('%I:%M %p') if c.fecha else 'S/F'
        lista_compras.append({
            'id': c.id,
            'hora': c_hora,
            'proveedor': c.proveedor.nombre if c.proveedor else 'General',
            'total_usd': str(seguro_decimal(c.total_usd)),
            'productos': [{'nombre': d.producto.nombre if d.producto else 'Producto Eliminado', 
                           'cantidad': str(d.cantidad), 
                           'costo': str(d.costo_unitario)} for d in c.detalles]
        })

    # 🧀 ENTREGAS DE QUESO DEL DÍA (Compras a Productores)
    entregas_queso = MovimientoProductor.query \
        .filter(
            func.date(MovimientoProductor.fecha) == str(fecha),
            MovimientoProductor.tipo == 'ENTREGA_QUESO'
        ) \
        .options(joinedload(MovimientoProductor.proveedor)).all()

    lista_entregas_queso = []
    for e in entregas_queso:
        e_hora = e.fecha.strftime('%I:%M %p') if e.fecha else 'S/F'
        lista_entregas_queso.append({
            'hora': e_hora,
            'productor': e.proveedor.nombre if e.proveedor else 'Desconocido',
            'kilos': str(e.kilos or Decimal('0.00')),
            'total_usd': str(e.haber or Decimal('0.00')),
            'pagado_usd': str(e.debe or Decimal('0.00')),
            'deuda_usd': str((e.haber or Decimal('0.00')) - (e.debe or Decimal('0.00'))),
            'descripcion': e.descripcion or ''
        })

    return json.dumps(lista_ventas), json.dumps(lista_compras), json.dumps(lista_entregas_queso)


def _calcular_resumen(hoy_date):
    # 🏦 OBTENER TOTALES DESDE MOVIMIENTOS DE CAJA (La fuente de la verdad)
    def get_neto(tipo_caja, metodos=None):
        def query_monto(tipo_mov):
            q = db.session.query(func.sum(MovimientoCaja.monto)).filter(
                func.date(MovimientoCaja.fecha) == str(hoy_date),
                MovimientoCaja.tipo_caja == tipo_caja,
                MovimientoCaja.tipo_movimiento == tipo_mov
            )
            if metodos:
                # 🛡️ PROTECCIÓN ANTI-DUPLICADO:
                # Usamos una sola cláusula OR para que cada movimiento se cuente una sola vez
                # aunque coincida con varias palabras clave (ej: "Débito" y "Tarjeta Débito").
                filtros = [MovimientoCaja.descripcion.ilike(f'%{m}%') for m in metodos]
                q = q.filter(or_(*filtros))
            return q.scalar() or Decimal('0')

        # 🚀 CORRECCIÓN: Solo retornamos los INGRESOS del día (Ventas + Abonos).
        # Los egresos se muestran por separado en 'Salidas de Caja' para no generar saldos negativos
        # si el cajero olvidó registrar la Apertura del día.
        ingresos = query_monto('INGRESO')
        return ingresos

    # 📊 Calculamos los netos esperados en cada caja
    efectivo_usd    = get_neto('Caja USD')
    efectivo_bs     = get_neto('Caja Bs')
    pago_movil      = get_neto('Banco', ['Pago Móvil', 'PAGO_MOVIL', 'PM'])
    biopago         = get_neto('Banco', ['Biopago', 'BIOPAGO'])
    debito          = get_neto('Banco', ['Tarjeta Débito', 'Débito', 'DEBITO', 'Debito'])
    transferencia   = get_neto('Banco', ['Transferencia', 'TRANSFERENCIA', 'Tarjeta/Transf', 'Transf'])

    # Fiado y Compras ( Informativo )
    fiado_nuevo = db.session.query(func.sum(func.coalesce(Venta.saldo_pendiente_usd, 0))).filter(
        func.date(Venta.fecha) == str(hoy_date),
        Venta.es_fiado == True
    ).scalar() or Decimal('0')

    total_compras = db.session.query(func.sum(func.coalesce(Compra.total_usd, 0))).filter(
        func.date(Compra.fecha) == str(hoy_date)
    ).scalar() or Decimal('0')

    # 🧀 TOTALES COMPRAS DE QUESO A PRODUCTORES DEL DÍA
    total_queso_comprado = db.session.query(func.sum(func.coalesce(MovimientoProductor.haber, 0))).filter(
        func.date(MovimientoProductor.fecha) == str(hoy_date),
        MovimientoProductor.tipo == 'ENTREGA_QUESO'
    ).scalar() or Decimal('0')

    total_queso_pagado = db.session.query(func.sum(func.coalesce(MovimientoProductor.debe, 0))).filter(
        func.date(MovimientoProductor.fecha) == str(hoy_date),
        MovimientoProductor.tipo == 'ENTREGA_QUESO'
    ).scalar() or Decimal('0')

    total_queso_deuda = total_queso_comprado - total_queso_pagado

    tasa_obj = TasaBCV.query.order_by(TasaBCV.id.desc()).first()
    tasa = Decimal(str(tasa_obj.valor)) if tasa_obj and tasa_obj.valor else Decimal('1.00')

    # Total general en equivalencia USD (Todo lo cobrado en Cash + Banco)
    if tasa <= 0:
        total_cobrado = efectivo_usd # Evitar error si la tasa es 0 o negativa
    else:
        total_cobrado = efectivo_usd + (efectivo_bs / tasa) + ((pago_movil + biopago + debito + transferencia) / tasa)

    # --- NUEVOS CÁLCULOS PARA PRODUCTORES ---
    pagos_prod_usd = db.session.query(func.sum(MovimientoCaja.monto)).filter(
        func.date(MovimientoCaja.fecha) == str(hoy_date),
        MovimientoCaja.categoria.in_(['Pago Productor', 'Pago a Proveedor']),
        MovimientoCaja.tipo_movimiento == 'EGRESO',
        MovimientoCaja.tipo_caja == 'Caja USD'
    ).scalar() or Decimal('0')

    pagos_prod_bs = db.session.query(func.sum(MovimientoCaja.monto)).filter(
        func.date(MovimientoCaja.fecha) == str(hoy_date),
        MovimientoCaja.categoria.in_(['Pago Productor', 'Pago a Proveedor']),
        MovimientoCaja.tipo_movimiento == 'EGRESO',
        MovimientoCaja.tipo_caja.in_(['Caja Bs', 'Banco'])
    ).scalar() or Decimal('0')

    abonos_prod_usd = db.session.query(func.sum(MovimientoCaja.monto)).filter(
        func.date(MovimientoCaja.fecha) == str(hoy_date),
        MovimientoCaja.categoria == 'Abono Productor',
        MovimientoCaja.tipo_movimiento == 'INGRESO',
        MovimientoCaja.tipo_caja == 'Caja USD'
    ).scalar() or Decimal('0')

    abonos_prod_bs = db.session.query(func.sum(MovimientoCaja.monto)).filter(
        func.date(MovimientoCaja.fecha) == str(hoy_date),
        MovimientoCaja.categoria == 'Abono Productor',
        MovimientoCaja.tipo_movimiento == 'INGRESO',
        MovimientoCaja.tipo_caja.in_(['Caja Bs', 'Banco'])
    ).scalar() or Decimal('0')

    cobro_queso = db.session.query(func.sum(Venta.total_usd)).filter(
        func.date(Venta.fecha) == str(hoy_date),
        Venta.pago_efectivo_usd == 0,
        Venta.pago_efectivo_bs == 0,
        Venta.pago_movil_bs == 0,
        Venta.es_fiado == False
    ).scalar() or Decimal('0')

    # --- NUEVOS CÁLCULOS PARA APERTURA ---
    apertura_usd = db.session.query(func.sum(MovimientoCaja.monto)).filter(
        func.date(MovimientoCaja.fecha) == str(hoy_date),
        MovimientoCaja.categoria == 'Ingreso Manual',
        MovimientoCaja.descripcion.ilike('%Apertura%'),
        MovimientoCaja.tipo_caja == 'Caja USD'
    ).scalar() or Decimal('0')

    apertura_bs = db.session.query(func.sum(MovimientoCaja.monto)).filter(
        func.date(MovimientoCaja.fecha) == str(hoy_date),
        MovimientoCaja.categoria == 'Ingreso Manual',
        MovimientoCaja.descripcion.ilike('%Apertura%'),
        MovimientoCaja.tipo_caja == 'Caja Bs'
    ).scalar() or Decimal('0')

    # --- CÁLCULO DE VENTAS REALES ---
    total_ventas_brutas = db.session.query(func.sum(Venta.total_usd)).filter(
        func.date(Venta.fecha) == str(hoy_date)
    ).scalar() or Decimal('0')
    
    total_premios = db.session.query(func.sum(func.coalesce(Venta.pago_otros_usd, 0))).filter(
        func.date(Venta.fecha) == str(hoy_date)
    ).scalar() or Decimal('0')
    
    print(f"DEBUG: Fecha={hoy_date} | Ventas Brutas={total_ventas_brutas} | Premios={total_premios}")
    
    total_cobrado_ventas = total_ventas_brutas - fiado_nuevo - total_premios
    
    return {
        'efectivo_usd': efectivo_usd,
        'efectivo_bs':  efectivo_bs,
        'pago_movil':   pago_movil,
        'biopago':      biopago,
        'debito':       debito,
        'transferencia': transferencia,
        'fiado':        fiado_nuevo,
        'premios':      total_premios,
        'total_general': total_cobrado_ventas, 
        'total_ventas': total_ventas_brutas, 
        'total_compras_usd': total_compras,
        'cobro_queso': seguro_decimal(cobro_queso),
        'pagos_productores_usd': seguro_decimal(pagos_prod_usd),
        'pagos_productores_bs': seguro_decimal(pagos_prod_bs),
        'abonos_productores_usd': seguro_decimal(abonos_prod_usd),
        'abonos_productores_bs': seguro_decimal(abonos_prod_bs),
        'conteo': Venta.query.filter(func.date(Venta.fecha) == str(hoy_date)).count(),
        'apertura_usd': apertura_usd,
        'apertura_bs': apertura_bs,
        'total_queso_comprado': seguro_decimal(total_queso_comprado),
        'total_queso_pagado': seguro_decimal(total_queso_pagado),
        'total_queso_deuda': seguro_decimal(total_queso_deuda),
    }


@cierre_bp.route('/reporte_cierre')
@login_required
@staff_required
def vista_cierre():
    tasa_obj = TasaBCV.query.order_by(TasaBCV.id.desc()).first()
    tasa = tasa_obj.valor if tasa_obj else Decimal('1.00')
    from models import hoy_ve
    hoy_date = hoy_ve()
    r = _calcular_resumen(hoy_date)
    ya_cerrado = CierreCaja.query.filter_by(fecha=hoy_date).first()

    movs_hoy = MovimientoCaja.query.filter(
        func.date(MovimientoCaja.fecha) == str(hoy_date)
    ).order_by(MovimientoCaja.fecha.desc()).all()

    # ✅ Historial reciente para la tabla de abajo
    cierres_historial = CierreCaja.query.order_by(CierreCaja.fecha.desc()).limit(10).all()

    # ✅ NUEVO: Obtener cobros de hoy (Ventas y Abonos)
    ventas_hoy = Venta.query.filter(func.date(Venta.fecha) == str(hoy_date)).all()
    abonos_hoy = HistorialPago.query.filter(func.date(HistorialPago.fecha) == str(hoy_date)).all()
    lista_movimientos_detalle = []
    
    # Agregar ventas
    for v in ventas_hoy:
        lista_movimientos_detalle.append({
            'tipo': 'VENTA',
            'id': v.id,
            'hora': v.fecha,
            'cliente': v.nombre_cliente_final,
            'total_usd': v.total_usd or Decimal('0.00'),
            'efectivo_usd': v.pago_efectivo_usd or Decimal('0.00'),
            'efectivo_bs': v.pago_efectivo_bs or Decimal('0.00'),
            'pago_movil': v.pago_movil_bs or Decimal('0.00'),
            'debito': v.pago_debito_bs or Decimal('0.00'),
            'transferencia': v.pago_transferencia_bs or Decimal('0.00'),
            'biopago': v.biopago_bdv or Decimal('0.00'),
            'premios_usd': v.pago_otros_usd or Decimal('0.00'),
            'es_fiado': v.es_fiado
        })
    
    # Agregar abonos
    for a in abonos_hoy:
        if a.metodo_pago == 'ABONO INICIAL': continue
        lista_movimientos_detalle.append({
            'tipo': 'ABONO',
            'id': f"A-{a.id}",
            'hora': a.fecha,
            'cliente': f"PAGO: {a.cliente.nombre if a.cliente else 'S/N'}",
            'total_usd': a.monto_usd or Decimal('0.00'),
            'efectivo_usd': (a.monto_usd if a.metodo_pago == 'EFECTIVO_USD' else Decimal('0.00')),
            'efectivo_bs': (a.monto_bs if a.metodo_pago == 'EFECTIVO_BS' else Decimal('0.00')),
            'pago_movil': (a.monto_bs if a.metodo_pago == 'PAGO_MOVIL' else Decimal('0.00')),
            'debito': (a.monto_bs if a.metodo_pago == 'DEBITO' else Decimal('0.00')),
            'transferencia': (a.monto_bs if a.metodo_pago == 'TRANSFERENCIA' else Decimal('0.00')),
            'biopago': (a.monto_bs if a.metodo_pago == 'BIOPAGO' else Decimal('0.00')),
            'es_fiado': False
        })
    
    # Ordenar por hora desc
    lista_movimientos_detalle.sort(key=lambda x: x['hora'], reverse=True)

    # 🧀 Entregas de queso de hoy
    entregas_queso_hoy = MovimientoProductor.query \
        .filter(
            func.date(MovimientoProductor.fecha) == str(hoy_date),
            MovimientoProductor.tipo == 'ENTREGA_QUESO'
        ) \
        .options(joinedload(MovimientoProductor.proveedor)) \
        .order_by(MovimientoProductor.fecha.desc()).all()

    return render_template('cierre_diario.html',
        r=r,
        ventas_hoy=lista_movimientos_detalle,
        entregas_queso_hoy=entregas_queso_hoy,
        fecha=hoy_date,
        tasa=tasa,
        ya_cerrado=ya_cerrado,
        movs_hoy=movs_hoy,
        cierres_historial=cierres_historial,
    )

@cierre_bp.route('/ejecutar_cierre', methods=['POST'])
@login_required
@staff_required
def ejecutar_cierre():
    from models import hoy_ve
    hoy_date = hoy_ve()
    ya_cerrado = CierreCaja.query.filter_by(fecha=hoy_date).first()
    if ya_cerrado:
        flash('⚠️ Ya existe un cierre guardado para hoy.', 'warning')
        return redirect(url_for('cierre.vista_cierre'))

    # 1. Recibir montos REALES declarados por el cajero (Cierre Ciego)
    real_usd = seguro_decimal(request.form.get('real_usd'))
    real_bs  = seguro_decimal(request.form.get('real_bs'))
    real_pm  = seguro_decimal(request.form.get('real_pago_movil'))
    real_bio = seguro_decimal(request.form.get('real_biopago'))
    real_tr  = seguro_decimal(request.form.get('real_transferencia'))
    real_deb = seguro_decimal(request.form.get('real_debito'))
    obs      = request.form.get('observaciones', '')

    tasa_obj = TasaBCV.query.order_by(TasaBCV.id.desc()).first()
    tasa = tasa_obj.valor if tasa_obj and tasa_obj.valor else Decimal('1.00')

    # 2. Calcular montos ESPERADOS por el sistema
    r = _calcular_resumen(hoy_date)
    esp_usd = r['efectivo_usd']
    esp_bs  = r['efectivo_bs']
    esp_pm  = r['pago_movil']
    esp_bio = r['biopago']
    esp_tr  = r['transferencia']
    esp_deb = r['debito']

    # 3. Calcular Diferencias
    dif_usd = real_usd - esp_usd
    dif_bs  = real_bs - esp_bs
    dif_pm  = real_pm - esp_pm
    dif_tr  = real_tr - esp_tr
    dif_bio = real_bio - esp_bio
    dif_deb = real_deb - esp_deb

    # 4. Registrar Asiento Contable de Ajuste por Diferencia (SI las hay)
    movimientos = []
    
    if dif_usd != 0:
        cta_caja = '1.1.01.01'
        cta_dif  = '4.1.04' if dif_usd > 0 else '5.1.04'
        if dif_usd > 0: # Sobrante
            movimientos.append({'cuenta_codigo': cta_caja, 'debe_usd': dif_usd, 'haber_usd': 0, 'debe_bs': dif_usd*tasa, 'haber_bs': 0})
            movimientos.append({'cuenta_codigo': cta_dif,  'debe_usd': 0, 'haber_usd': dif_usd, 'debe_bs': 0, 'haber_bs': dif_usd*tasa})
        else: # Faltante
            movimientos.append({'cuenta_codigo': cta_dif,  'debe_usd': abs(dif_usd), 'haber_usd': 0, 'debe_bs': abs(dif_usd)*tasa, 'haber_bs': 0})
            movimientos.append({'cuenta_codigo': cta_caja, 'debe_usd': 0, 'haber_usd': abs(dif_usd), 'debe_bs': 0, 'haber_bs': abs(dif_usd)*tasa})

    if dif_bs != 0:
        cta_caja = '1.1.01.02'
        cta_dif  = '4.1.04' if dif_bs > 0 else '5.1.04'
        if dif_bs > 0: # Sobrante
            movimientos.append({'cuenta_codigo': cta_caja, 'debe_usd': dif_bs / tasa, 'haber_usd': 0, 'debe_bs': dif_bs, 'haber_bs': 0})
            movimientos.append({'cuenta_codigo': cta_dif,  'debe_usd': 0, 'haber_usd': dif_bs / tasa, 'debe_bs': 0, 'haber_bs': dif_bs})
        else: # Faltante
            movimientos.append({'cuenta_codigo': cta_dif,  'debe_usd': abs(dif_bs) / tasa, 'haber_usd': 0, 'debe_bs': abs(dif_bs), 'haber_bs': 0})
            movimientos.append({'cuenta_codigo': cta_caja, 'debe_usd': 0, 'haber_usd': abs(dif_bs) / tasa, 'debe_bs': 0, 'haber_bs': abs(dif_bs)})

    # Ajustes de Banco (Opcional pero recomendado para cuadre total)
    for d, cta, msg in [
        (dif_pm + dif_tr, '1.1.01.03', 'BANCO PM/TR'),
        (dif_bio,        '1.1.01.04', 'BANCO BIO'),
        (dif_deb,        '1.1.01.05', 'BANCO DEBITO')
    ]:
        if d != 0:
            cta_dif = '4.1.04' if d > 0 else '5.1.04'
            if d > 0:
                movimientos.append({'cuenta_codigo': cta,     'debe_usd': d / tasa, 'haber_usd': 0, 'debe_bs': d, 'haber_bs': 0})
                movimientos.append({'cuenta_codigo': cta_dif, 'debe_usd': 0, 'haber_usd': d / tasa, 'debe_bs': 0, 'haber_bs': d})
            else:
                movimientos.append({'cuenta_codigo': cta_dif, 'debe_usd': abs(d) / tasa, 'haber_usd': 0, 'debe_bs': abs(d), 'haber_bs': 0})
                movimientos.append({'cuenta_codigo': cta,     'debe_usd': 0, 'haber_usd': abs(d) / tasa, 'debe_bs': 0, 'haber_bs': abs(d)})

    if movimientos:
        registrar_asiento(
            descripcion=f"AJUSTE CIERRE DE CAJA {hoy_date} - Diferencia detectada",
            tasa=tasa,
            referencia_tipo='CIERRE_AJUSTE',
            referencia_id=0,
            movimientos=movimientos
        )

    # 5. Generar Snapshots de Ventas y Compras
    json_ventas, json_compras, json_queso = _generar_json_detalles(hoy_date)

    # 6. Guardar el Cierre
    nuevo_cierre = CierreCaja(
        fecha=hoy_date,
        monto_usd=esp_usd,
        monto_bs=esp_bs,
        pago_movil=esp_pm,
        transferencia=esp_tr,
        biopago=esp_bio,
        tarjeta_debito=esp_deb,
        monto_real_usd=real_usd,
        monto_real_bs=real_bs,
        diferencia_usd=dif_usd,
        diferencia_bs=dif_bs,
        observaciones=obs,
        tasa_cierre=tasa,
        total_ventas_usd=r['total_ventas'],
        total_compras_usd=r['total_compras_usd'],
        fiado_dia_usd=r['fiado'],
        detalle_ventas=json_ventas,
        detalle_compras=json_compras,
        cajero_nombre=current_user.username,
        monto_apertura_usd=r.get('apertura_usd', 0),
        monto_apertura_bs=r.get('apertura_bs', 0)
    )

    db.session.add(nuevo_cierre)
    db.session.commit()

    logger.info(f"🏁 Cierre de Caja Ejecutado: Fecha={hoy_date} | Total Ventas=${r['total_general']:.2f} | Usuario={current_user.username}")
    flash('✅ Cierre de caja PROcesado exitosamente a nivel contable.', 'success')
    return redirect(url_for('cierre.ver_cierre', cierre_id=nuevo_cierre.id))

@cierre_bp.route('/ver_cierre/<int:cierre_id>')
@login_required
@staff_required
def ver_cierre(cierre_id):
    cierre = CierreCaja.query.get_or_404(cierre_id)
    ventas  = json.loads(cierre.detalle_ventas  or '[]')
    compras = json.loads(cierre.detalle_compras or '[]')
    return render_template('ver_cierre.html', cierre=cierre, ventas=ventas, compras=compras)

@cierre_bp.route('/registrar_apertura', methods=['POST'])
@login_required
@staff_required
def registrar_apertura():
    if current_user.role == 'cajero':
        flash('⛔ No tienes permiso para registrar la apertura. Solicita al Administrador.', 'danger')
        return redirect(url_for('cierre.vista_cierre'))

    monto_usd = seguro_decimal(request.form.get('monto_usd', '0'))
    monto_bs  = seguro_decimal(request.form.get('monto_bs', '0'))
    
    if monto_usd < 0 or monto_bs < 0:
        flash("❌ Los montos de apertura no pueden ser negativos.", "danger")
        return redirect(url_for('cierre.vista_cierre'))
    
    from models import hoy_ve
    hoy = hoy_ve()
    tasa_obj = TasaBCV.query.order_by(TasaBCV.id.desc()).first()
    tasa_valor = Decimal(str(tasa_obj.valor)) if tasa_obj else Decimal('1.00')

    # Eliminar aperturas previas del mismo día para evitar duplicados
    MovimientoCaja.query.filter(
        func.date(MovimientoCaja.fecha) == hoy,
        MovimientoCaja.descripcion.ilike('%Apertura%')
    ).delete(synchronize_session=False)

    if monto_usd > 0:
        db.session.add(MovimientoCaja(
            fecha=datetime.now(),
            tipo_movimiento='INGRESO',
            tipo_caja='Caja USD',
            categoria='Ingreso Manual',
            monto=monto_usd,
            tasa_dia=tasa_valor,
            descripcion='Apertura del Día (USD)',
            modulo_origen='Cierre',
            user_id=current_user.id
        ))

    if monto_bs > 0:
        db.session.add(MovimientoCaja(
            fecha=datetime.now(),
            tipo_movimiento='INGRESO',
            tipo_caja='Caja Bs',
            categoria='Ingreso Manual',
            monto=monto_bs,
            tasa_dia=tasa_valor,
            descripcion='Apertura del Día (Bs)',
            modulo_origen='Cierre',
            user_id=current_user.id
        ))

    db.session.commit()
    flash('✅ Apertura de caja registrada correctamente.', 'success')
    return redirect(url_for('cierre.vista_cierre'))


@cierre_bp.route('/historial_cierres')
@login_required
@staff_required
def historial_cierres():
    if current_user.role not in ['admin', 'supervisor', 'dueno']:
        flash('⛔ No tienes permiso para ver el historial de cierres.', 'danger')
        return redirect(url_for('cierre.vista_cierre'))
    cierres = CierreCaja.query.order_by(CierreCaja.fecha.desc()).all()
    return render_template('historial_cierres.html', cierres=cierres)

@cierre_bp.route('/ejecutar_cierre_retroactivo', methods=['POST'])
@login_required
@staff_required
def ejecutar_cierre_retroactivo():
    if current_user.role not in ['admin', 'supervisor', 'dueno']:
        flash('⛔ No tienes permiso.', 'danger')
        return redirect(url_for('cierre.vista_cierre'))

    fecha_str = request.form.get('fecha_retroactiva')
    if not fecha_str:
        flash('⚠️ Debe indicar una fecha.', 'warning')
        return redirect(url_for('cierre.vista_cierre'))

    try:
        fecha_cierre = datetime.strptime(fecha_str, '%Y-%m-%d').date()
    except ValueError:
        flash('⚠️ Fecha inválida.', 'warning')
        return redirect(url_for('cierre.vista_cierre'))

    ya_cerrado = CierreCaja.query.filter_by(fecha=fecha_cierre).first()
    if ya_cerrado:
        flash(f'⚠️ Ya existe un cierre para {fecha_cierre}.', 'warning')
        return redirect(url_for('cierre.vista_cierre'))

    # 2. Calcular montos ESPERADOS por el sistema
    r = _calcular_resumen(fecha_cierre)

    # 3. Generar Snapshots de Ventas y Compras
    json_ventas, json_compras, json_queso = _generar_json_detalles(fecha_cierre)

    tasa_obj = TasaBCV.query.order_by(TasaBCV.id.desc()).first()
    tasa = Decimal(str(tasa_obj.valor)) if tasa_obj else Decimal('1.0')

    esp_usd = r['efectivo_usd']
    esp_bs  = r['efectivo_bs']

    # 4. Sincronización Contable (Asiento)
    total_venta_usd = r['total_general'] + r['fiado']
    if total_venta_usd > 0:
        movs = []
        # Entradas a Cajas/Bancos
        if r['efectivo_usd'] > 0:
            movs.append({'cuenta_codigo': '1.1.01.01', 'debe_usd': r['efectivo_usd'], 'haber_usd': 0, 'debe_bs': r['efectivo_usd']*tasa, 'haber_bs': 0})
        if r['efectivo_bs'] > 0:
            movs.append({'cuenta_codigo': '1.1.01.02', 'debe_usd': r['efectivo_bs']/tasa, 'haber_usd': 0, 'debe_bs': r['efectivo_bs'], 'haber_bs': 0})
        if r['pago_movil'] > 0 or r['transferencia'] > 0:
            total_pm_tr = r['pago_movil'] + r['transferencia']
            movs.append({'cuenta_codigo': '1.1.01.03', 'debe_usd': total_pm_tr/tasa, 'haber_usd': 0, 'debe_bs': total_pm_tr, 'haber_bs': 0})
        if r['biopago'] > 0:
            movs.append({'cuenta_codigo': '1.1.01.04', 'debe_usd': r['biopago']/tasa, 'haber_usd': 0, 'debe_bs': r['biopago'], 'haber_bs': 0})
        if r['debito'] > 0:
            movs.append({'cuenta_codigo': '1.1.01.05', 'debe_usd': r['debito']/tasa, 'haber_usd': 0, 'debe_bs': r['debito'], 'haber_bs': 0})
        
        # Cuentas por Cobrar (Fiado)
        if r['fiado'] > 0:
            movs.append({'cuenta_codigo': '1.1.02.01', 'debe_usd': r['fiado'], 'haber_usd': 0, 'debe_bs': r['fiado']*tasa, 'haber_bs': 0})

        # Contrapartida: Ventas
        if r['total_general'] > 0:
            movs.append({'cuenta_codigo': '4.1.01', 'debe_usd': 0, 'haber_usd': r['total_general'], 'debe_bs': 0, 'haber_bs': r['total_general']*tasa})
        if r['fiado'] > 0:
            movs.append({'cuenta_codigo': '4.1.02', 'debe_usd': 0, 'haber_usd': r['fiado'], 'debe_bs': 0, 'haber_bs': r['fiado']*tasa})

        if movs:
            try:
                registrar_asiento(
                    descripcion=f"CIERRE DIARIO (RETROACTIVO) - {fecha_cierre}",
                    tasa=tasa,
                    referencia_tipo='CIERRE',
                    referencia_id=0,
                    movimientos=movs
                )
            except Exception as e:
                logger.error(f"❌ Error contable en cierre retroactivo {fecha_cierre}: {e}")

    # 5. Guardar el Cierre
    nuevo_cierre = CierreCaja(
        fecha=fecha_cierre,
        monto_bs=esp_bs,
        monto_usd=esp_usd,
        pago_movil=r['pago_movil'],
        transferencia=r['transferencia'],
        biopago=r['biopago'],
        tarjeta_debito=r['debito'],
        tasa_cierre=tasa,
        total_ventas_usd=total_venta_usd,
        total_compras_usd=r['total_compras_usd'],
        fiado_dia_usd=r['fiado'],
        detalle_ventas=json_ventas,
        detalle_compras=json_compras
    )

    db.session.add(nuevo_cierre)
    db.session.commit()

    logger.info(f"🔙 Cierre Retroactivo: Fecha={fecha_cierre} | Total=${total_venta_usd:.2f} | User={current_user.username}")
    flash(f'✅ Cierre retroactivo del {fecha_cierre} guardado y sincronizado contablemente.', 'success')
    return redirect(url_for('cierre.vista_cierre'))

@cierre_bp.route('/eliminar_cierre/<int:cierre_id>', methods=['POST'])
@login_required
@staff_required
def eliminar_cierre(cierre_id):
    if current_user.role not in ['admin', 'supervisor', 'dueno']:
        flash('⛔ No tienes permiso para esta acción.', 'danger')
        return redirect(url_for('cierre.historial_cierres'))

    cierre = CierreCaja.query.get_or_404(cierre_id)
    try:
        # Nota: No eliminamos los asientos contables asociados para no descuadrar el balance histórico
        # pero permitimos eliminar el registro de cierre para poder 're-hacerlo' si fue un error.
        fecha_c = cierre.fecha
        db.session.delete(cierre)
        db.session.commit()
        logger.warning(f"🗑️ Cierre eliminado: ID {cierre_id} (Fecha {fecha_c}) por {current_user.username}")
        flash(f'🗑️ Registro de cierre para el {fecha_c} eliminado. Ahora puede volver a ejecutarlo si es necesario.', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'❌ Error al eliminar: {str(e)}', 'danger')
    
    return redirect(url_for('cierre.historial_cierres'))

@cierre_bp.route('/regenerar_detalles_cierre/<int:cierre_id>', methods=['POST'])
@login_required
@staff_required
def regenerar_detalles_cierre(cierre_id):
    if current_user.role not in ['admin', 'supervisor', 'dueno']:
        return jsonify({'success': False, 'message': 'Sin permiso'}), 403

    cierre = CierreCaja.query.get_or_404(cierre_id)
    try:
        json_ventas, json_compras, json_queso = _generar_json_detalles(cierre.fecha)
        cierre.detalle_ventas = json_ventas
        cierre.detalle_compras = json_compras
        db.session.commit()
        return jsonify({'success': True, 'message': 'Detalles regenerados con éxito.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})