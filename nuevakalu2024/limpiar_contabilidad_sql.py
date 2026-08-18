import os
from app import app, db
from models import (
    Venta, DetalleVenta, HistorialPago, MovimientoCaja, CierreCaja, 
    Asiento, DetalleAsiento, Compra, DetalleCompra, MovimientoProductor, 
    PagoProductor, CuentaPorPagar, AbonoCuentaPorPagar, Pedido, DetallePedido,
    VentaPausada, DetalleVentaPausada
)

def limpiar_contabilidad():
    print("==================================================")
    print(" INICIANDO LIMPIEZA DE CONTABILIDAD (SQL) KALU")
    print("==================================================")
    print("Se borraran ventas, cierres, movimientos, etc.")
    print("Se mantendran Productos, Proveedores, Clientes, Usuarios.")
    print("==================================================")
    confirmacion = input("Escribe 'ELIMINAR' para continuar: ")
    
    if confirmacion.strip().upper() != 'ELIMINAR':
        print("Operación cancelada.")
        return

    with app.app_context():
        # Lista en orden de dependencias para evitar violaciones de foreign key
        tablas_a_limpiar = [
            DetalleVentaPausada, VentaPausada, DetalleVenta, Venta, 
            HistorialPago, DetalleAsiento, Asiento, MovimientoCaja, 
            CierreCaja, DetalleCompra, Compra, MovimientoProductor, 
            PagoProductor, AbonoCuentaPorPagar, CuentaPorPagar, 
            DetallePedido, Pedido
        ]
        
        exito = True
        for tabla in tablas_a_limpiar:
            try:
                eliminados = db.session.query(tabla).delete()
                print(f"[OK] Limpiados {eliminados} registros de: {tabla.__name__}")
            except Exception as e:
                db.session.rollback()
                print(f"[ERROR] No se pudo limpiar {tabla.__name__}: {e}")
                exito = False
                break
        
        if exito:
            db.session.commit()
            print("==================================================")
            print(" ¡CONTABILIDAD LIMPIADA CON ÉXITO!")
            print(" Todos los clientes, productos y proveedores siguen intactos.")
            print("==================================================")

if __name__ == '__main__':
    limpiar_contabilidad()
