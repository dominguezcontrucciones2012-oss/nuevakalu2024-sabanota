
from app import app, db
from routes.cierre import _calcular_resumen, _generar_json_detalles
from models import CierreCaja, User, TasaBCV
from decimal import Decimal
from datetime import datetime
import json
import logging

# Configure logging to see what's happening
logging.basicConfig(level=logging.DEBUG)

def simulate_cierre():
    with app.app_context():
        print("--- Iniciando simulación de cierre ---")
        hoy_date = datetime.now().date()
        
        # 1. Obtener datos reales (simulados)
        r = _calcular_resumen(hoy_date)
        print(f"Resumen calculado: {r}")
        
        # Simulamos una diferencia: Faltante de $5 en USD y Sobrante de 100 Bs
        real_usd = r['efectivo_usd'] - Decimal('5.00')
        real_bs = r['efectivo_bs'] + Decimal('100.00')
        real_pm = r['pago_movil']
        real_bio = r['biopago']
        real_tr = r['transferencia']
        real_deb = r['debito']
        
        # Replicamos la lógica de ejecutar_cierre
        dif_usd = real_usd - r['efectivo_usd']
        dif_bs  = real_bs - r['efectivo_bs']
        dif_pm  = real_pm - r['pago_movil']
        dif_tr  = real_tr - r['transferencia']
        dif_bio = real_bio - r['biopago']
        dif_deb = real_deb - r['debito']
        
        tasa_obj = TasaBCV.query.order_by(TasaBCV.id.desc()).first()
        tasa = tasa_obj.valor if tasa_obj and tasa_obj.valor else Decimal('1.00')
        print(f"Tasa: {tasa}")

        movimientos = []
        if dif_usd != 0:
            cta_caja = '1.1.01.01'
            cta_dif  = '4.1.04' if dif_usd > 0 else '5.1.04'
            if dif_usd > 0:
                movimientos.append({'cuenta_codigo': cta_caja, 'debe_usd': dif_usd, 'haber_usd': 0, 'debe_bs': dif_usd*tasa, 'haber_bs': 0})
                movimientos.append({'cuenta_codigo': cta_dif,  'debe_usd': 0, 'haber_usd': dif_usd, 'debe_bs': 0, 'haber_bs': dif_usd*tasa})
            else:
                movimientos.append({'cuenta_codigo': cta_dif,  'debe_usd': abs(dif_usd), 'haber_usd': 0, 'debe_bs': abs(dif_usd)*tasa, 'haber_bs': 0})
                movimientos.append({'cuenta_codigo': cta_caja, 'debe_usd': 0, 'haber_usd': abs(dif_usd), 'debe_bs': 0, 'haber_bs': abs(dif_usd)*tasa})

        if dif_bs != 0:
            cta_caja = '1.1.01.02'
            cta_dif  = '4.1.04' if dif_bs > 0 else '5.1.04'
            if dif_bs > 0:
                movimientos.append({'cuenta_codigo': cta_caja, 'debe_usd': dif_bs / tasa, 'haber_usd': 0, 'debe_bs': dif_bs, 'haber_bs': 0})
                movimientos.append({'cuenta_codigo': cta_dif,  'debe_usd': 0, 'haber_usd': dif_bs / tasa, 'debe_bs': 0, 'haber_bs': dif_bs})
            else:
                movimientos.append({'cuenta_codigo': cta_dif,  'debe_usd': abs(dif_bs) / tasa, 'haber_usd': 0, 'debe_bs': abs(dif_bs), 'haber_bs': 0})
                movimientos.append({'cuenta_codigo': cta_caja, 'debe_usd': 0, 'haber_usd': abs(dif_bs) / tasa, 'debe_bs': 0, 'haber_bs': abs(dif_bs)})

        print(f"Movimientos generados: {len(movimientos)}")
        
        # Aquí es donde podría fallar o colgarse
        from routes.contabilidad import registrar_asiento
        if movimientos:
            print("Registrando asiento...")
            registrar_asiento(
                descripcion="TEST AJUSTE",
                tasa=tasa,
                referencia_tipo='TEST',
                referencia_id=0,
                movimientos=movimientos
            )
            print("Asiento registrado.")

        print("Generando JSON detalles...")
        json_v, json_c = _generar_json_detalles(hoy_date)
        print("JSON generado.")

        user = User.query.first()
        
        print("Guardando registro de cierre...")
        nuevo_cierre = CierreCaja(
            fecha=hoy_date,
            monto_usd=r['efectivo_usd'],
            monto_bs=r['efectivo_bs'],
            pago_movil=r['pago_movil'],
            transferencia=r['transferencia'],
            biopago=r['biopago'],
            tarjeta_debito=r['debito'],
            monto_real_usd=real_usd,
            monto_real_bs=real_bs,
            diferencia_usd=dif_usd,
            diferencia_bs=dif_bs,
            observaciones="TEST",
            tasa_cierre=tasa,
            total_ventas_usd=r['total_general'] + r['fiado'],
            total_compras_usd=r['total_compras_usd'],
            fiado_dia_usd=r['fiado'],
            detalle_ventas=json_v,
            detalle_compras=json_c,
            cajero_nombre=user.username if user else 'maestro'
        )
        db.session.add(nuevo_cierre)
        db.session.commit()
        print("--- Simulación completada con éxito ---")

if __name__ == "__main__":
    simulate_cierre()
