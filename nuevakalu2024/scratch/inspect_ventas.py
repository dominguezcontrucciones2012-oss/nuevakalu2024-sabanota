import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Venta, DetalleVenta

with app.app_context():
    for vid in [1232, 1266]:
        print(f"\n==========================================")
        print(f"VENTA ID: {vid}")
        print(f"==========================================")
        v = Venta.query.get(vid)
        if not v:
            print("Venta no encontrada.")
            continue
            
        print(f"Fecha: {v.fecha}")
        print(f"Total USD: {v.total_usd}")
        print(f"Es Fiado: {v.es_fiado} | Pagada: {v.pagada}")
        print(f"Efectivo USD: {v.pago_efectivo_usd} | Efectivo Bs: {v.pago_efectivo_bs} | Pago Móvil Bs: {v.pago_movil_bs} | Transferencia Bs: {v.pago_transferencia_bs}")
        print(f"Saldo Pendiente USD: {v.saldo_pendiente_usd}")
        print(f"Usuario ID: {v.user_id}")
        
        print("Detalles:")
        for d in v.detalles:
            print(f"  - Producto: {d.producto.nombre} | Cantidad: {d.cantidad} | Precio Unitario USD: {d.precio_unitario_usd}")
