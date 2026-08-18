import os
import sys
from datetime import datetime, date

sys.path.append(os.path.abspath(os.path.dirname(__file__) + '/..'))

from app import app
from models import db, CierreCaja
from routes.cierre import _calcular_resumen, _generar_json_detalles
from routes.contabilidad import registrar_asiento
from decimal import Decimal

with app.app_context():
    fecha_cierre = date(2026, 5, 21)
    print("=== PROBANDO CIERRE RETROACTIVO MANUALLY ===")
    
    ya_cerrado = CierreCaja.query.filter_by(fecha=fecha_cierre).first()
    print("Ya cerrado?", ya_cerrado)
    
    r = _calcular_resumen(fecha_cierre)
    print("Resumen:", r)
    
    json_ventas, json_compras = _generar_json_detalles(fecha_cierre)
    
    tasa = Decimal('530.00') # Tasa de ayer
    
    total_venta_usd = r['total_general'] + r['fiado']
    print("Total venta USD:", total_venta_usd)
    
    if total_venta_usd > 0:
        movs = []
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
        
        if r['fiado'] > 0:
            movs.append({'cuenta_codigo': '1.1.02.01', 'debe_usd': r['fiado'], 'haber_usd': 0, 'debe_bs': r['fiado']*tasa, 'haber_bs': 0})

        if r['total_general'] > 0:
            movs.append({'cuenta_codigo': '4.1.01', 'debe_usd': 0, 'haber_usd': r['total_general'], 'debe_bs': 0, 'haber_bs': r['total_general']*tasa})
        if r['fiado'] > 0:
            movs.append({'cuenta_codigo': '4.1.02', 'debe_usd': 0, 'haber_usd': r['fiado'], 'debe_bs': 0, 'haber_bs': r['fiado']*tasa})

        print("Movimientos de asiento:", movs)
        
        try:
            registrar_asiento(
                descripcion=f"CIERRE DIARIO (RETROACTIVO) - {fecha_cierre}",
                tasa=tasa,
                referencia_tipo='CIERRE',
                referencia_id=0,
                movimientos=movs
            )
            print("Asiento registrado successfully.")
        except Exception as e:
            print("Error al registrar asiento:", e)
            
    print("Guardando cierre...")
    try:
        nuevo_cierre = CierreCaja(
            fecha=fecha_cierre,
            monto_bs=r['efectivo_bs'],
            monto_usd=r['efectivo_usd'],
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
        print("Cierre guardado y confirmado.")
    except Exception as e:
        db.session.rollback()
        print("Error al guardar cierre:", e)
