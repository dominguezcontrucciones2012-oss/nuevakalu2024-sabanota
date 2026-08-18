import sys
import os
from decimal import Decimal
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db, Proveedor, MovimientoProductor, Asiento

with app.app_context():
    print("SIMULACION DE CORRECCION DE SALDOS Y LIBRETAS DE PRODUCTORES...")
    print("=" * 100)
    
    productores = Proveedor.query.filter(
        (Proveedor.es_productor == True) | (Proveedor.es_obrero == True)
    ).all()
    
    # 1. Traer todos los movimientos de la base de datos a memoria para simular
    for p in productores:
        movs = MovimientoProductor.query.filter_by(proveedor_id=p.id).order_by(
            MovimientoProductor.fecha.asc(),
            MovimientoProductor.id.asc()
        ).all()
        
        # Crear una copia de los movimientos en una lista de diccionarios
        mov_list = []
        for m in movs:
            mov_list.append({
                'id': m.id,
                'fecha': m.fecha,
                'tipo': m.tipo,
                'debe': float(m.debe or 0),
                'haber': float(m.haber or 0),
                'desc': m.descripcion or '',
                'saldo_momento': float(m.saldo_momento or 0)
            })
            
        # --- APLICAR CORRECCIONES EN MEMORIA ---
        
        # A. Insertar entregas de queso faltantes (Asientos 1470 y 1471)
        if p.id == 10:  # Angelito
            mov_list.append({
                'id': 999910,  # ID temporal para la simulacion
                'fecha': movs[0].fecha, # Insertar al inicio o donde corresponda (usaremos orden cronologico en la simulacion)
                'tipo': 'ENTREGA_QUESO',
                'debe': 0.0,
                'haber': 124.50,
                'desc': '[CONCILIADO] Recibido 24.9kg. Compra Queso Asiento Contable 1470',
                'saldo_momento': 0.0
            })
            
            # B. Corregir pago de 20 USD (ID: 1062) de Debe a Haber
            for m in mov_list:
                if m['id'] == 1062:
                    m['haber'] = 20.00
                    m['debe'] = 0.00
                    m['desc'] = "[CORREGIDO] " + m['desc']
                    
        elif p.id == 7:  # Marcos Corro
            mov_list.append({
                'id': 999907,
                'fecha': movs[0].fecha,
                'tipo': 'ENTREGA_QUESO',
                'debe': 0.0,
                'haber': 124.50,
                'desc': '[CONCILIADO] Recibido 24.9kg. Compra Queso Asiento Contable 1471',
                'saldo_momento': 0.0
            })
            
        # C. Corregir sistemáticamente todos los ABONO_POS
        for m in mov_list:
            if m['tipo'] == 'ABONO_POS':
                if m['debe'] > 0 and m['haber'] == 0:
                    m['haber'] = m['debe']
                    m['debe'] = 0.0
                    m['desc'] = "[CORREGIDO SIGNOS] " + m['desc']
                    
        # --- REORDENAR CRONOLOGICAMENTE Y RECALCULAR SALDOS ---
        # Ordenamos por fecha y luego por ID
        mov_list.sort(key=lambda x: (x['fecha'], x['id']))
        
        running_balance = 0.0
        for m in mov_list:
            running_balance = running_balance + m['haber'] - m['debe']
            m['saldo_momento_recalc'] = running_balance
            
        # Mostrar comparacion de saldos
        actual_db = float(p.saldo_pendiente_usd or 0)
        recalc_final = running_balance
        diff = recalc_final - actual_db
        
        if p.id in [7, 10] or abs(diff) > 0.01:
            print(f"\nProductor: {p.nombre} (ID: {p.id})")
            print(f"  - Saldo Actual en Base de Datos:   ${actual_db:+8.2f}")
            print(f"  - Saldo Recalculado (Corregido):   ${recalc_final:+8.2f}")
            print(f"  - Desviacion corregida:            ${diff:+8.2f} (en su {'favor' if diff > 0 else 'contra'})")
            print(f"  - Cantidad de Movimientos: {len(mov_list)}")
            
            # Mostrar los ultimos 5 movimientos recalculados
            print("  Ultimos 5 movimientos:")
            for m in mov_list[-5:]:
                print(f"    * ID: {m['id']:6d} | Fecha: {m['fecha']} | Tipo: {m['tipo']:15s} | Debe: {m['debe']:7.2f} | Haber: {m['haber']:7.2f} | Saldo: {m['saldo_momento_recalc']:+8.2f} | Desc: {m['desc']}")
            print("-" * 100)
