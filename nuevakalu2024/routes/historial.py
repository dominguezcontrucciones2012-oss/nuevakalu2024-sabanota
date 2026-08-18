from flask import Blueprint, render_template, request, jsonify
from models import db, Venta, Cliente, DetalleVenta, Producto
from sqlalchemy.orm import joinedload
from sqlalchemy import func, or_, cast, String

historial_bp = Blueprint('historial', __name__)

@historial_bp.route('/historial')
def ver_historial():
    page = request.args.get('page', 1, type=int)
    q = request.args.get('q', '', type=str).strip()
    
    query = Venta.query.options(
        joinedload(Venta.cliente),
        joinedload(Venta.detalles).joinedload(DetalleVenta.producto)
    )

    if q:
        query = query.join(Cliente, Venta.cliente_id == Cliente.id, isouter=True) \
                     .join(DetalleVenta, Venta.id == DetalleVenta.venta_id, isouter=True) \
                     .join(Producto, DetalleVenta.producto_id == Producto.id, isouter=True) \
                     .filter(
                         or_(
                             Cliente.nombre.ilike(f'%{q}%'),
                             Cliente.cedula.ilike(f'%{q}%'),
                             Producto.nombre.ilike(f'%{q}%'),
                             Producto.codigo.ilike(f'%{q}%'),
                             cast(Venta.id, String).ilike(f'%{q}%')
                         )
                     ).distinct()

    ventas_paginadas = query.order_by(Venta.fecha.desc()).paginate(page=page, per_page=50, error_out=False)

    return render_template(
        'historial.html',
        ventas_paginadas=ventas_paginadas,
        ventas=ventas_paginadas.items,
        q=q
    )

@historial_bp.route('/api/ventas/total-acumulado')
def api_total_acumulado():
    total_historico = db.session.query(func.coalesce(func.sum(Venta.total_usd), 0)).scalar()
    return jsonify({'total': float(total_historico)})