import sys
import os
from datetime import datetime, date
from decimal import Decimal

# Add current directory to path
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app import app
from models import db, Cliente, Venta, HistorialPago, MovimientoProductor, Proveedor, CuentaPorPagar, AbonoCuentaPorPagar, PagoProductor, PagoReportado

# Redirect stdout to query_output.txt
sys.stdout = open('query_output.txt', 'w', encoding='utf-8')

with app.app_context():
    print("=== BUSCANDO TODOS LOS PRODUCTORES / PROVEEDORES QUE CONTIENEN 'ANDRE' ===")
    proveedores = Proveedor.query.filter(Proveedor.nombre.ilike('%andre%')).all()
    
    for p in proveedores:
        print(f"\n==========================================")
        print(f"PROVEEDOR: {p.nombre} (ID: {p.id})")
        print(f"RIF: {p.rif}, Saldo en tabla: {p.saldo_pendiente_usd}")
        print(f"==========================================")
        
        # Obtener todos los movimientos ordenados por fecha
        movs = MovimientoProductor.query.filter_by(proveedor_id=p.id).order_by(MovimientoProductor.fecha).all()
        print(f"Movimientos registrados: {len(movs)}")
        
        for m in movs:
            m_date_str = m.fecha.strftime('%Y-%m-%d %H:%M:%S')
            print(f"  Mov ID: {m.id} | Fecha: {m_date_str} | Tipo: {m.tipo:<15} | Desc: {m.descripcion[:60]} | Debe: {m.debe} | Haber: {m.haber} | Saldo Momento DB: {m.saldo_momento}")

    # Let's check clients as well
    print("\n=== CLIENTES QUE CONTIENEN 'ANDRE' ===")
    clientes = Cliente.query.filter(Cliente.nombre.ilike('%andre%')).all()
    for c in clientes:
        print(f"Cliente: {c.nombre} (ID: {c.id}) | Saldo USD: {c.saldo_usd}")
        c_ventas = Venta.query.filter_by(cliente_id=c.id).order_by(Venta.fecha).all()
        print("  Ventas:")
        for v in c_ventas:
            print(f"    Venta ID: {v.id} | Fecha: {v.fecha} | Total: {v.total_usd} | Pendiente: {v.saldo_pendiente_usd} | Fiado: {v.es_fiado} | Pagada: {v.pagada}")
        c_pagos = HistorialPago.query.filter_by(cliente_id=c.id).order_by(HistorialPago.fecha).all()
        print("  Abonos:")
        for p in c_pagos:
            print(f"    Pago ID: {p.id} | Fecha: {p.fecha} | Monto: {p.monto_usd} | Metodo: {p.metodo_pago}")

    print("\n=== CUENTAS POR PAGAR (CXP) PARA ESTOS PROVEEDORES ===")
    for p in proveedores:
        cxps = CuentaPorPagar.query.filter_by(proveedor_id=p.id).order_by(CuentaPorPagar.fecha).all()
        print(f"Proveedor: {p.nombre} (ID: {p.id}) - CXPs: {len(cxps)}")
        for cxp in cxps:
            print(f"  CxP ID: {cxp.id} | Fecha: {cxp.fecha} | Nro Factura: {cxp.numero_factura} | Total: {cxp.monto_total_usd} | Abonado: {cxp.monto_abonado_usd} | Pendiente: {cxp.saldo_pendiente_usd} | Estatus: {cxp.estatus}")
            for ab in cxp.abonos:
                print(f"    -> Abono ID: {ab.id} | Fecha: {ab.fecha} | Monto: {ab.monto_usd} | Metodo: {ab.metodo_pago} | Desc: {ab.descripcion}")

    print("\n=== PAGOS REPORTADOS PARA ESTAS PERSONAS ===")
    pagos_rep = PagoReportado.query.all()
    for pr in pagos_rep:
        is_match = False
        if pr.cliente_id in [c.id for c in clientes]:
            is_match = True
        if pr.proveedor_id in [p.id for p in proveedores]:
            is_match = True
        if is_match:
            pname = pr.cliente.nombre if pr.cliente else (pr.proveedor.nombre if pr.proveedor else "Desconocido")
            print(f"  PagoRep ID: {pr.id} | Nombre: {pname} | Fecha: {pr.fecha_reporte} | Monto USD: {pr.monto_usd} | Monto BS: {pr.monto_bs} | Estado: {pr.estado} | Banco: {pr.banco} | Ref: {pr.referencia} | Obs: {pr.observacion}")
            
    # Let's search for any payments or movements on April 13, 2026 for Andres
    print("\n=== VERIFICANDO TRANSACCIONES DEL 13 DE ABRIL DE 2026 ===")
    target_date = date(2026, 4, 13)
    
    # Let's see if there are any invoices or payments specifically on 2026-04-13 for anyone with 'andre' in name
    movs_13 = MovimientoProductor.query.filter(db.func.date(MovimientoProductor.fecha) == target_date).all()
    for m in movs_13:
        if 'andre' in m.proveedor.nombre.lower():
            print(f"  Mov Productor 13/04: ID={m.id}, Nombre={m.proveedor.nombre}, Tipo={m.tipo}, Desc={m.descripcion}, Debe={m.debe}, Haber={m.haber}, Saldo Momento={m.saldo_momento}")
            
    ventas_13 = Venta.query.filter(db.func.date(Venta.fecha) == target_date).all()
    for v in ventas_13:
        client_name = v.cliente.nombre if v.cliente else "Consumidor Final"
        # check if this venta has an associated MovimientoProductor for Andres
        mov_assoc = MovimientoProductor.query.filter(
            MovimientoProductor.tipo == 'COMPRA_POS',
            MovimientoProductor.descripcion.like(f'%#{v.id}%')
        ).first()
        if mov_assoc and 'andre' in mov_assoc.proveedor.nombre.lower():
            print(f"  Venta POS 13/04: VentaID={v.id}, Prov={mov_assoc.proveedor.nombre}, Total={v.total_usd}, Pendiente={v.saldo_pendiente_usd}, Fiado={v.es_fiado}")
            
sys.stdout.close()
sys.stdout = sys.__stdout__
print("Listo, salida en query_output.txt")
