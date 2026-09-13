from app import app, db
from models import Cliente, Venta, HistorialPago, TasaBCV
from decimal import Decimal

with app.app_context():
    for cliente in Cliente.query.all():
        pagos = HistorialPago.query.filter_by(cliente_id=cliente.id).all()
        abono_total_disponible = sum((Decimal(str(p.monto_usd or 0)) for p in pagos), Decimal('0.00'))
        ventas = Venta.query.filter(Venta.cliente_id == cliente.id, Venta.es_fiado == True).order_by(Venta.fecha.asc()).all()
        cambios = False
        for v in ventas:
            total_v = Decimal(str(v.total_usd or 0))
            if abono_total_disponible >= total_v:
                if Decimal(str(v.saldo_pendiente_usd or 0)) != Decimal('0.00'):
                    v.saldo_pendiente_usd = Decimal('0.00')
                    cambios = True
                abono_total_disponible -= total_v
            else:
                pendiente_real = total_v - abono_total_disponible
                if abs(Decimal(str(v.saldo_pendiente_usd or 0)) - pendiente_real) > Decimal('0.01'):
                    v.saldo_pendiente_usd = pendiente_real
                    cambios = True
                abono_total_disponible = Decimal('0.00')
                v._pendiente_dec = pendiente_real
        saldo_real_facturas = sum((v._pendiente_dec for v in ventas if hasattr(v, '_pendiente_dec')), Decimal('0.00'))
        if abs(saldo_real_facturas) < 0.01: saldo_real_facturas = Decimal('0.00')
        if abs(Decimal(str(cliente.saldo_usd or 0)) - saldo_real_facturas) > Decimal('0.01') or cambios:
            cliente.saldo_usd = saldo_real_facturas
            tasa_obj = TasaBCV.query.order_by(TasaBCV.id.desc()).first()
            tasa = Decimal(str(tasa_obj.valor)) if tasa_obj else Decimal('1.0')
            cliente.saldo_bs = (cliente.saldo_usd * tasa).quantize(Decimal('0.01'))
            db.session.commit()
            print(f"Reparado: {cliente.nombre} -> Deuda real: {saldo_real_facturas}")
