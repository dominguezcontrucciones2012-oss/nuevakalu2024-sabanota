import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Proveedor, MovimientoProductor

with app.app_context():
    print("=== PRODUCTORES ENCONTRADOS ===")
    prods = Proveedor.query.all()
    for p in prods:
        if any(x in p.nombre.lower() for x in ['angel', 'marco', 'corro']):
            print(f"ID: {p.id} | Nombre: {p.nombre} | RIF: {p.rif} | Saldo: {p.saldo_pendiente_usd}")
            
    # Vamos a detallar todos los movimientos del productor con ID 15 y los de la familia Corro
    for pid in [15, 19, 32]:
        p = Proveedor.query.get(pid)
        if not p:
            continue
        print(f"\n==========================================")
        print(f"MOVIMIENTOS DE: {p.nombre} (ID: {p.id})")
        print(f"==========================================")
        movs = MovimientoProductor.query.filter_by(proveedor_id=p.id).order_by(MovimientoProductor.fecha.asc()).all()
        
        # Vamos a recalcular el saldo paso a paso para ver si hubo un error en la suma
        saldo_calculado = 0.0
        for m in movs:
            debe = float(m.debe or 0)
            haber = float(m.haber or 0)
            
            # En la libreta de productor:
            # - Haber: lo que le debemos al productor por traernos queso (aumenta saldo a favor del productor)
            # - Debe: lo que el productor nos debe a nosotros o lo que le pagamos / cobramos (disminuye el saldo a favor del productor, o aumenta la deuda del productor)
            # Espera, vamos a ver cómo se calcula en el proyecto.
            # En models.py:
            # `nuevo_saldo = productor.saldo_pendiente_usd - falta_usd` (en compra_pos)
            # Espera, `debe=falta_usd` (el productor debe esto por la compra POS).
            # Entonces `nuevo_saldo = saldo_anterior - debe` (o sea, las compras en POS/deudas restan al saldo que tiene a favor el productor).
            # Y los pagos que le hacemos?
            # Vamos a ver cómo se calcula el saldo en `routes/productores.py` o cómo se maneja.
            # Imprimamos cada movimiento con sus valores para analizarlo.
            print(f"ID: {m.id} | Fecha: {m.fecha.strftime('%Y-%m-%d %H:%M:%S')} | Tipo: {m.tipo:15s} | Debe: {debe:6.2f} | Haber: {haber:6.2f} | Registrado: {float(m.saldo_momento):8.2f} | Desc: {m.descripcion}")
