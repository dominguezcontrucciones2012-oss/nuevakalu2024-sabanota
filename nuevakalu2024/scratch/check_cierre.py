import sys
import os
from datetime import datetime, date
from decimal import Decimal

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Cliente, Venta, HistorialPago, MovimientoCaja, CierreCaja, TasaBCV

with app.app_context():
    # Target date is May 22, 2026 (local time on user's system)
    target_date = date(2026, 5, 22)
    print(f"=== REVISIÓN DE VENTAS Y CIERRE PARA EL: {target_date} ===")

    # 1. Tasa BCV
    tasa_obj = TasaBCV.query.order_by(TasaBCV.id.desc()).first()
    tasa = Decimal(str(tasa_obj.valor)) if tasa_obj else Decimal('1.00')
    print(f"Tasa BCV actual: {tasa}")

    # 2. Ventas del día
    ventas = Venta.query.filter(db.func.date(Venta.fecha) == target_date).all()
    print(f"\nCantidad de ventas registradas hoy: {len(ventas)}")
    
    total_ventas_usd = Decimal('0.00')
    total_efectivo_usd = Decimal('0.00')
    total_efectivo_bs = Decimal('0.00')
    total_pago_movil_bs = Decimal('0.00')
    total_debito_bs = Decimal('0.00')
    total_transferencia_bs = Decimal('0.00')
    total_biopago_usd = Decimal('0.00')
    total_premios_usd = Decimal('0.00')
    total_fiado_usd = Decimal('0.00')
    
    for v in ventas:
        total_ventas_usd += v.total_usd or Decimal('0.00')
        total_efectivo_usd += v.pago_efectivo_usd or Decimal('0.00')
        total_efectivo_bs += v.pago_efectivo_bs or Decimal('0.00')
        total_pago_movil_bs += v.pago_movil_bs or Decimal('0.00')
        total_debito_bs += v.pago_debito_bs or Decimal('0.00')
        total_transferencia_bs += v.pago_transferencia_bs or Decimal('0.00')
        total_biopago_usd += v.biopago_bdv or Decimal('0.00')
        total_premios_usd += v.pago_otros_usd or Decimal('0.00')
        total_fiado_usd += v.saldo_pendiente_usd if v.es_fiado else Decimal('0.00')
        
    print(f"Sumatoria de Ventas (Brutas): ${total_ventas_usd}")
    print(f"  - Efectivo USD: ${total_efectivo_usd}")
    print(f"  - Efectivo Bs: Bs. {total_efectivo_bs}")
    print(f"  - Pago Móvil Bs: Bs. {total_pago_movil_bs}")
    print(f"  - Débito Bs: Bs. {total_debito_bs}")
    print(f"  - Transferencia Bs: Bs. {total_transferencia_bs}")
    print(f"  - Biopago USD: ${total_biopago_usd}")
    print(f"  - Premios/Otros USD: ${total_premios_usd}")
    print(f"  - Fiado USD: ${total_fiado_usd}")

    # 3. Abonos (HistorialPago) del día
    abonos = HistorialPago.query.filter(db.func.date(HistorialPago.fecha) == target_date).all()
    print(f"\nCantidad de abonos/pagos de deuda registrados hoy: {len(abonos)}")
    
    abono_efectivo_usd = Decimal('0.00')
    abono_efectivo_bs = Decimal('0.00')
    abono_pago_movil_bs = Decimal('0.00')
    abono_debito_bs = Decimal('0.00')
    abono_transferencia_bs = Decimal('0.00')
    abono_biopago_bs = Decimal('0.00')
    
    for a in abonos:
        if a.metodo_pago == 'ABONO INICIAL':
            continue
        print(f"  Abono ID: {a.id} | Cliente: {a.cliente.nombre if a.cliente else 'N/A'} | Monto USD: ${a.monto_usd} | Monto Bs: Bs. {a.monto_bs} | Método: {a.metodo_pago}")
        if a.metodo_pago == 'EFECTIVO_USD':
            abono_efectivo_usd += a.monto_usd
        elif a.metodo_pago == 'EFECTIVO_BS':
            abono_efectivo_bs += a.monto_bs
        elif a.metodo_pago == 'PAGO_MOVIL':
            abono_pago_movil_bs += a.monto_bs
        elif a.metodo_pago == 'DEBITO':
            abono_debito_bs += a.monto_bs
        elif a.metodo_pago == 'TRANSFERENCIA':
            abono_transferencia_bs += a.monto_bs
        elif a.metodo_pago == 'BIOPAGO':
            abono_biopago_bs += a.monto_bs

    # 4. Movimientos de Caja del día
    movs = MovimientoCaja.query.filter(db.func.date(MovimientoCaja.fecha) == target_date).all()
    print(f"\nMovimientos de Caja registrados hoy ({len(movs)}):")
    for m in movs:
        print(f"  ID: {m.id} | Caja: {m.tipo_caja:<10} | Tipo: {m.tipo_movimiento:<7} | Cat: {m.categoria:<15} | Monto: {m.monto} | Desc: {m.descripcion}")

    # 5. Cierres de caja registrados hoy
    cierres = CierreCaja.query.filter(CierreCaja.fecha == target_date).all()
    print(f"\nCierres de Caja registrados para hoy ({len(cierres)}):")
    for c in cierres:
        print(f"  Cierre ID: {c.id}")
        print(f"  Cajero: {c.cajero_nombre}")
        print(f"  Esperado en Caja USD: ${c.monto_usd} | Declarado USD: ${c.monto_real_usd} | Dif USD: ${c.diferencia_usd}")
        print(f"  Esperado en Caja Bs: Bs. {c.monto_bs} | Declarado Bs: Bs. {c.monto_real_bs} | Dif Bs: Bs. {c.diferencia_bs}")
        print(f"  Pago Móvil Esperado: Bs. {c.pago_movil}")
        print(f"  Biopago Esperado: Bs. {c.biopago}")
        print(f"  Débito Esperado: Bs. {c.tarjeta_debito}")
        print(f"  Transferencia Esperado: Bs. {c.transferencia}")
        print(f"  Total Ventas USD: ${c.total_ventas_usd}")
        print(f"  Total Compras USD: ${c.total_compras_usd}")
        print(f"  Fiado Día USD: ${c.fiado_dia_usd}")
        print(f"  Apertura USD: ${c.monto_apertura_usd} | Apertura Bs: {c.monto_apertura_bs}")
        print(f"  Obs: {c.observaciones}")

    # 6. Calcular qué debería dar el Cierre según la función _calcular_resumen
    from routes.cierre import _calcular_resumen
    resumen = _calcular_resumen(target_date)
    print("\n--- RESUMEN ESTIMADO POR EL SISTEMA (_calcular_resumen) ---")
    for k, v in resumen.items():
        print(f"  {k}: {v}")
