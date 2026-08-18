import sys
import os
from datetime import datetime
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, MovimientoProductor, MovimientoCaja, Venta, Compra, Asiento, AuditoriaInventario

start_time = datetime(2026, 4, 10, 18, 20, 0)
end_time = datetime(2026, 4, 10, 18, 50, 0)

with app.app_context():
    print(f"AUDITANDO EVENTOS DEL SISTEMA ENTRE {start_time} Y {end_time}")
    print("=" * 80)
    
    # 1. MovimientoProductor
    movs = MovimientoProductor.query.filter(MovimientoProductor.fecha >= start_time, MovimientoProductor.fecha <= end_time).all()
    print(f"MovimientoProductor ({len(movs)}):")
    for m in movs:
        print(f"  - ID: {m.id} | Prod: {m.proveedor.nombre} | Tipo: {m.tipo} | Debe: {m.debe} | Haber: {m.haber} | Saldo: {m.saldo_momento} | Desc: {m.descripcion} | Fecha: {m.fecha}")
        
    # 2. MovimientoCaja
    mcajas = MovimientoCaja.query.filter(MovimientoCaja.fecha >= start_time, MovimientoCaja.fecha <= end_time).all()
    print(f"\nMovimientoCaja ({len(mcajas)}):")
    for mc in mcajas:
        print(f"  - ID: {mc.id} | Caja: {mc.tipo_caja} | Tipo: {mc.tipo_movimiento} | Monto: {mc.monto} | Desc: {mc.descripcion} | Fecha: {mc.fecha}")
        
    # 3. Venta
    ventas = Venta.query.filter(Venta.fecha >= start_time, Venta.fecha <= end_time).all()
    print(f"\nVenta ({len(ventas)}):")
    for v in ventas:
        print(f"  - ID: {v.id} | Total: {v.total_usd} | Pendiente: {v.saldo_pendiente_usd} | Fecha: {v.fecha}")
        
    # 4. Asiento
    asientos = Asiento.query.filter(Asiento.created_at >= start_time, Asiento.created_at <= end_time).all() if hasattr(Asiento, 'created_at') else []
    print(f"\nAsiento ({len(asientos)}):")
    for a in asientos:
        print(f"  - ID: {a.id} | Desc: {a.descripcion} | Referencia: {a.referencia_tipo} (ID: {a.referencia_id}) | Fecha: {a.created_at}")
        
    # 5. AuditoriaInventario
    auds = AuditoriaInventario.query.filter(AuditoriaInventario.fecha >= start_time, AuditoriaInventario.fecha <= end_time).all()
    print(f"\nAuditoriaInventario ({len(auds)}):")
    for au in auds:
        print(f"  - ID: {au.id} | Prod: {au.producto_nombre} | Accion: {au.accion} | Cantidad: {au.cantidad_despues - au.cantidad_antes} | Fecha: {au.fecha}")
