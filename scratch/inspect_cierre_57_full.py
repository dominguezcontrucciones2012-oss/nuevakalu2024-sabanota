import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import CierreCaja

with app.app_context():
    c = CierreCaja.query.get(57)
    if c:
        print("=== CAMPOS CLAVE DE CIERRE 57 ===")
        print(f"cajero_nombre: {c.cajero_nombre}")
        print(f"fecha: {c.fecha}")
        print(f"tasa_cierre: {c.tasa_cierre}")
        print(f"monto_usd (Esperado Efectivo USD): {c.monto_usd}")
        print(f"monto_real_usd (Real Efectivo USD): {c.monto_real_usd}")
        print(f"monto_bs (Esperado Efectivo Bs): {c.monto_bs}")
        print(f"monto_real_bs (Real Efectivo Bs): {c.monto_real_bs}")
        print(f"pago_movil (Esperado PM): {c.pago_movil}")
        print(f"transferencia (Esperado Transf): {c.transferencia}")
        print(f"biopago (Esperado Biopago): {c.biopago}")
        print(f"tarjeta_debito (Esperado Debito): {c.tarjeta_debito}")
        print(f"diferencia_usd (Total USD): {c.diferencia_usd}")
        print(f"diferencia_bs (Total Bs): {c.diferencia_bs}")
        print(f"observaciones: {c.observaciones}")
    else:
        print("No existe el cierre 57.")
