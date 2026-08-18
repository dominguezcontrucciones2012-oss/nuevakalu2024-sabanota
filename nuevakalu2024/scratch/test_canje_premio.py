import sys
from decimal import Decimal
from app import app
from models import db, Cliente, Producto, Venta, DetalleVenta, Asiento, DetalleAsiento, AuditoriaInventario, User

def run_test():
    with app.app_context():
        print("=== INICIANDO PRUEBA DE CANJE DE PREMIOS ===")
        
        # 1. Buscar cajero/admin para simular el login en la peticion
        user = User.query.filter_by(username='maestro').first()
        if not user:
            print("ERROR: No se encontro el usuario maestro.")
            return

        # 2. Buscar producto y cliente reales
        prod = Producto.query.filter(Producto.stock > 1).first()
        if not prod:
            print("ERROR: No hay productos con stock suficiente en la base de datos.")
            return

        cliente = Cliente.query.get(1)  # Omarcito corro
        if not cliente:
            print("ERROR: No se encontro al cliente ID 1.")
            return

        # Guardar valores originales para limpieza posterior
        orig_cliente_puntos = cliente.puntos
        orig_cliente_premios = cliente.documentos
        orig_prod_stock = prod.stock
        venta_id = None

        print(f"Producto seleccionado: {prod.nombre} | ID: {prod.id} | Stock: {prod.stock} | Precio: {prod.precio_normal_usd}")
        print(f"Cliente seleccionado: {cliente.nombre} | ID: {cliente.id} | Puntos: {cliente.puntos} | Premios: {cliente.documentos}")

        try:
            # Configurar temporalmente premios del cliente a 1 para poder canjear
            cliente.documentos = 1
            db.session.commit()
            print(f"-> Premios de {cliente.nombre} temporalmente actualizados a: {cliente.documentos}")

            # 3. Preparar el cliente de prueba de Flask y simular la sesion
            client = app.test_client()
            with client.session_transaction() as sess:
                sess['_user_id'] = str(user.id)
                sess['_fresh'] = True

            # Crear carrito de compras
            precio = float(prod.precio_normal_usd)
            cant = 1
            total_usd = precio

            # Simulamos un pago mixto: $5.00 con premios y el resto con USD efectivo
            pago_premio = 5.0
            pago_efectivo = max(0.0, total_usd - pago_premio)

            payload = {
                "transaction_token": "test-token-premio-123456-final-re",
                "cliente_id": cliente.id,
                "cliente_tipo": "cliente",
                "items": [{"id": prod.id, "cantidad": cant, "precio": precio}],
                "total_usd": total_usd,
                "pago_efectivo_usd": pago_efectivo,
                "pago_premio_usd": pago_premio,
                "pago_efectivo_bs": 0.0,
                "pago_movil_bs": 0.0,
                "pago_transferencia_bs": 0.0,
                "pago_debito_bs": 0.0,
                "biopago_bdv": 0.0,
                "vuelto_usd_entregado": 0.0,
                "es_fiado": False,
                "tasa": 36.5  # Tasa simulada
            }

            print(f"\nEnviando venta: Total=${total_usd:.2f} | Pago Premio=${pago_premio:.2f} | Pago USD Cash=${pago_efectivo:.2f}")
            response = client.post('/procesar_venta', json=payload)
            res_data = response.get_json()

            print(f"Respuesta del POS: {res_data}")

            if response.status_code == 200 and res_data.get('success'):
                venta_id = res_data.get('venta_id')
                print(f"\nVenta procesada exitosamente con ID: {venta_id}")

                # 4. Verificar base de datos
                venta = Venta.query.get(venta_id)
                print(f"\n--- DETALLES DE VENTA EN DB ---")
                print(f"Venta ID: {venta.id}")
                print(f"Total USD: {venta.total_usd}")
                print(f"Pago Otros USD (Premios): {venta.pago_otros_usd}")
                print(f"Pago Efectivo USD: {venta.pago_efectivo_usd}")
                print(f"Cliente ID: {venta.cliente_id}")

                # Verificar cliente actualizado
                cliente_upd = Cliente.query.get(cliente.id)
                print(f"\n--- CLIENTE DESPUES DE VENTA ---")
                print(f"Nombre: {cliente_upd.nombre}")
                print(f"Puntos: {cliente_upd.puntos}")
                print(f"Premios: {cliente_upd.documentos} (Deberia ser 0, consumio 1)")

                # Verificar Asiento contable
                asiento = Asiento.query.filter_by(referencia_tipo='VENTA', referencia_id=venta_id).first()
                if asiento:
                    print(f"\n--- ASIENTO CONTABLE ASOCIADO (Asiento ID: {asiento.id}) ---")
                    detalles = DetalleAsiento.query.filter_by(asiento_id=asiento.id).all()
                    for d in detalles:
                        print(f"  Cuenta: {d.cuenta.codigo} ({d.cuenta.nombre}) | Debe USD: {d.debe_usd} | Haber USD: {d.haber_usd} | Debe Bs: {d.debe_bs} | Haber Bs: {d.haber_bs}")
                else:
                    print("No se encontro asiento contable para esta venta.")
            else:
                print("La simulacion de venta fallo.")
        finally:
            print("\nIniciando eliminacion del rastro contable (cleanup)...")
            
            # Borrar detalles del asiento y el asiento si se crearon
            if venta_id:
                asiento = Asiento.query.filter_by(referencia_tipo='VENTA', referencia_id=venta_id).first()
                if asiento:
                    DetalleAsiento.query.filter_by(asiento_id=asiento.id).delete()
                    db.session.delete(asiento)
                    print("  -> Asientos contables eliminados.")

                # Borrar auditoria de inventario
                AuditoriaInventario.query.filter_by(producto_id=prod.id, accion='VENTA_POS').filter(AuditoriaInventario.cantidad_antes == orig_prod_stock).delete()
                print("  -> Historial de auditoria de inventario eliminado.")

                # Borrar detalle venta y venta
                DetalleVenta.query.filter_by(venta_id=venta_id).delete()
                venta = Venta.query.get(venta_id)
                if venta:
                    db.session.delete(venta)
                print("  -> Registros de Venta y DetalleVenta eliminados.")

            # Restaurar valores originales del cliente y producto
            cliente.puntos = orig_cliente_puntos
            cliente.documentos = orig_cliente_premios
            prod.stock = orig_prod_stock
            
            db.session.commit()
            print("\nLIMPIEZA COMPLETA: Base de datos restaurada al estado original.")

if __name__ == '__main__':
    run_test()
