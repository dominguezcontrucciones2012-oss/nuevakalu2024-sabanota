import sys
import os
import json
from datetime import datetime, date
from decimal import Decimal

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Force UTF-8 stdout
sys.stdout.reconfigure(encoding='utf-8')

from app import app
from models import db, Venta, CierreCaja

with app.app_context():
    target_date = date(2026, 5, 22)
    cierre = CierreCaja.query.filter_by(fecha=target_date).first()
    
    if not cierre:
        print("No se encontro ningun cierre para hoy.")
        sys.exit(0)
        
    print(f"=== COMPARANDO VENTAS ACTUALES CON EL CIERRE GUARDADO (ID: {cierre.id}) ===")
    
    # 1. Parsear ventas guardadas en el cierre
    ventas_cierre = json.loads(cierre.detalle_ventas or '[]')
    ids_cierre = []
    ventas_cierre_dict = {}
    for vc in ventas_cierre:
        v_id = vc.get('id')
        ids_cierre.append(v_id)
        ventas_cierre_dict[v_id] = vc
        
    print(f"Ventas/Abonos guardados en el cierre: {len(ventas_cierre)}")
    
    # 2. Ventas actuales en la base de datos para hoy
    ventas_db = Venta.query.filter(db.func.date(Venta.fecha) == target_date).all()
    ids_db = [v.id for v in ventas_db]
    print(f"Ventas actuales en DB para hoy: {len(ventas_db)}")
    
    # 3. Comparar las ventas
    print("\n--- ANALIZANDO DIFERENCIAS ---")
    
    # Ventas en DB que no estan en el cierre
    nuevas_ventas = []
    for v in ventas_db:
        if v.id not in ids_cierre and str(v.id) not in ids_cierre:
            nuevas_ventas.append(v)
            
    if nuevas_ventas:
        print(f"\n[ALERTA] Se encontraron {len(nuevas_ventas)} ventas en la Base de Datos que NO estan en el cierre:")
        for nv in nuevas_ventas:
            print(f"  Venta ID: {nv.id} | Hora: {nv.fecha} | Total: ${nv.total_usd} | Fiado: {nv.es_fiado} | Pendiente: ${nv.saldo_pendiente_usd}")
            print(f"    Detalles de productos:")
            for d in nv.detalles:
                print(f"      - {d.producto.nombre if d.producto else 'N/A'}: {d.cantidad} x ${d.precio_unitario_usd}")
    else:
        print("\nNo hay ventas nuevas en la DB que no estuvieran en el cierre.")
        
    # Ventas en el cierre que no estan en DB
    eliminadas_o_abonos = []
    for vid, vc in ventas_cierre_dict.items():
        if str(vid).startswith('ABONO-') or str(vid).startswith('A-'):
            # Es un abono
            continue
        # Check if the DB has this sale id (convert both to int/str)
        try:
            int_vid = int(vid)
        except ValueError:
            int_vid = None
            
        if int_vid not in ids_db:
            eliminadas_o_abonos.append(vc)
            
    if eliminadas_o_abonos:
        print(f"\n[ALERTA] Se encontraron {len(eliminadas_o_abonos)} ventas en el cierre que NO estan en la DB (posiblemente eliminadas):")
        for ev in eliminadas_o_abonos:
            print(f"  Venta ID: {ev['id']} | Hora: {ev.get('hora')} | Total: ${ev.get('total_usd')} | Cliente: {ev.get('cliente')}")
    else:
        print("\nNo hay ventas en el cierre que falten en la DB.")
        
    # Ventas que estan en ambos pero difieren
    diferentes = []
    for v in ventas_db:
        if v.id in ids_cierre or str(v.id) in ids_cierre:
            # Get the cierre representation
            vc = ventas_cierre_dict.get(v.id) or ventas_cierre_dict.get(str(v.id))
            if vc:
                c_total = Decimal(vc.get('total_usd', '0.00'))
                db_total = v.total_usd or Decimal('0.00')
                c_fiado = vc.get('fiado', False)
                db_fiado = v.es_fiado
                c_pendiente = Decimal(vc.get('saldo_pendiente', '0.00'))
                db_pendiente = v.saldo_pendiente_usd or Decimal('0.00')
                
                if c_total != db_total or c_fiado != db_fiado or c_pendiente != db_pendiente:
                    diferentes.append((v, vc))
                
    if diferentes:
        print(f"\n[ALERTA] Se encontraron {len(diferentes)} ventas que existen en ambos pero sus datos cambiaron:")
        for db_v, c_v in diferentes:
            print(f"  Venta ID: {db_v.id}")
            print(f"    En Cierre: Total=${c_v.get('total_usd')}, Fiado={c_v.get('fiado')}, Pendiente=${c_v.get('saldo_pendiente')}")
            print(f"    En DB:     Total=${db_v.total_usd}, Fiado={db_v.es_fiado}, Pendiente=${db_v.saldo_pendiente_usd}")
    else:
        print("\nTodas las ventas que estan en ambos coinciden perfectamente.")
