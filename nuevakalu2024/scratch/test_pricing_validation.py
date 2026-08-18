import sys
import os
from decimal import Decimal

sys.path.append(os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

if sys.platform.startswith('win'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from app import app
from models import db, Producto

with app.app_context():
    print("=== PROBANDO LA REGLA DE MARGEN DE GANANCIA DEL 15% ===")
    
    # 1. Test invalid offer price on creation
    print("\nPrueba 1: Intentar crear producto con costo $10.00 y precio de oferta $11.49 (ganancia < 15%)")
    try:
        p1 = Producto(
            codigo="TEST-P1",
            nombre="PRODUCTO PRUEBA MALO",
            costo_usd=Decimal('10.00'),
            precio_oferta_usd=Decimal('11.49')
        )
        print("FAIL: El validador debió levantar ValueError y no lo hizo.")
    except ValueError as e:
        # Clean potential non-ascii characters
        err_msg = str(e).encode('ascii', errors='ignore').decode('ascii')
        print(f"SUCCESS: Levanto ValueError correctamente:\n   '{err_msg}'")
        
    # 2. Test valid offer price on creation
    print("\nPrueba 2: Intentar crear producto con costo $10.00 y precio de oferta $11.50 (ganancia = 15%)")
    try:
        p2 = Producto(
            codigo="TEST-P2",
            nombre="PRODUCTO PRUEBA BUENO",
            costo_usd=Decimal('10.00'),
            precio_oferta_usd=Decimal('11.50')
        )
        print("SUCCESS: Creo el objeto en memoria correctamente.")
    except ValueError as e:
        print(f"FAIL: Rechazo una oferta valida del 15% de ganancia. Mensaje: {e}")

    # 3. Test zero/disabled offer price on creation
    print("\nPrueba 3: Intentar crear producto con costo $10.00 y precio de oferta $0.00 (sin oferta)")
    try:
        p3 = Producto(
            codigo="TEST-P3",
            nombre="PRODUCTO PRUEBA SIN OFERTA",
            costo_usd=Decimal('10.00'),
            precio_oferta_usd=Decimal('0.00')
        )
        print("SUCCESS: Creo el objeto en memoria correctamente.")
    except ValueError as e:
        print(f"FAIL: Rechazo oferta igual a cero. Mensaje: {e}")

    # 4. Test cost increase on existing product that breaks offer margin
    print("\nPrueba 4: Modificar costo en producto existente para violar margen (Costo: $5.00 -> $6.00 con Oferta fija de $6.50)")
    try:
        # Create a valid temp product first
        p4 = Producto(
            codigo="TEST-P4",
            nombre="PRODUCTO PRUEBA MODIFICAR",
            costo_usd=Decimal('5.00'),
            precio_oferta_usd=Decimal('6.50') # 30% margin, valid!
        )
        # Now change the cost to $6.00 (min offer should be 6 * 1.15 = 6.90, so $6.50 becomes invalid)
        p4.costo_usd = Decimal('6.00')
        print("FAIL: El validador debio levantar ValueError al subir el costo.")
    except ValueError as e:
        err_msg = str(e).encode('ascii', errors='ignore').decode('ascii')
        print(f"SUCCESS: Levanto ValueError correctamente:\n   '{err_msg}'")

    print("\n=== PRUEBAS FINALIZADAS ===")
