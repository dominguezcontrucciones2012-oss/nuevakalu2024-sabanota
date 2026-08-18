import sys
import os
import re
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Asiento, MovimientoProductor, Proveedor

with app.app_context():
    print("CONCILIANDO COMPRAS DE QUESO (ASIENTOS VS MOVIMIENTOS PRODUCTOR)...")
    print("=" * 80)
    
    asientos = Asiento.query.filter(
        (Asiento.referencia_tipo == 'COMPRA_QUESO') | 
        (Asiento.descripcion.like('%COMPRA QUESO%'))
    ).order_by(Asiento.id.asc()).all()
    
    missing_count = 0
    
    for a in asientos:
        desc = a.descripcion
        # Parsear kg y nombre
        # Ejemplo: "COMPRA QUESO: 24.9kg de ANGELITO | Pago: CREDITO"
        match = re.search(r"COMPRA QUESO:\s*([\d\.]+)kg\s*de\s*([^\|]+)", desc, re.IGNORECASE)
        if not match:
            continue
            
        kilos_str, nombre_str = match.groups()
        kilos = float(kilos_str)
        nombre_clean = nombre_str.strip()
        
        # Buscar el proveedor por nombre
        prov = Proveedor.query.filter(Proveedor.nombre.ilike(f"%{nombre_clean}%")).first()
        if not prov:
            print(f"  [!] No se encontró proveedor para: '{nombre_clean}' (Asiento ID: {a.id})")
            continue
            
        # Buscar en MovimientoProductor si existe una entrega de queso del mismo peso
        # Dado que los floats pueden tener ligeras variaciones, buscamos un rango +- 0.01
        mov = MovimientoProductor.query.filter(
            MovimientoProductor.proveedor_id == prov.id,
            MovimientoProductor.tipo == 'ENTREGA_QUESO',
            MovimientoProductor.kilos >= kilos - 0.01,
            MovimientoProductor.kilos <= kilos + 0.01
        ).first()
        
        if not mov:
            missing_count += 1
            print(f"\n[FALTANTE] Asiento ID: {a.id} | Desc: {desc}")
            print(f"  - Productor: {prov.nombre} (ID: {prov.id})")
            print(f"  - Kilos: {kilos} kg")
            
            # Obtener el haber (monto total) y debe (monto pagado) de los detalles de este asiento
            total_queso = 0.0
            monto_pagado = 0.0
            for det in a.detalles:
                # El debe en cuenta 13 es el total del queso comprado
                if det.cuenta_id == 13: 
                    total_queso = float(det.debe_usd or 0)
                # Si hay cuenta de pago (caja/banco, e.g. cuenta_id 1 o 2 o 3 etc), o si podemos sacarlo
                # del CXP o del haber en cuenta de caja
                if det.cuenta_id in [1, 2, 3, 4, 5]: # Cuentas de activo disponible
                    monto_pagado = float(det.haber_usd or 0)
                    
            print(f"  - Total Queso (Haber): ${total_queso:.2f}")
            print(f"  - Monto Pagado (Debe): ${monto_pagado:.2f}")
            
    print("\n" + "=" * 80)
    print(f"Total de entregas de queso faltantes en libretas: {missing_count}")
