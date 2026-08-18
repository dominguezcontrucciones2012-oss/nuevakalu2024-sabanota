import os
import json
import requests
from datetime import datetime, date, timedelta
from decimal import Decimal
from flask import Blueprint, render_template, request, jsonify, current_app
from flask_login import login_required, current_user
from models import Producto, Cliente, Venta, DetalleVenta, db
from dotenv import load_dotenv
import logging
from utils import seguro_decimal

# Carga la clave del archivo secreto .env
load_dotenv()

ia_kalu_bp = Blueprint('ia_kalu', __name__)
logger = logging.getLogger('KALU.ia_kalu')

@ia_kalu_bp.route('/ia-kalu')
@login_required
def index():
    # Análisis rápido para el Dashboard
    stock_bajo = Producto.query.filter(Producto.stock <= 5).all()
    proximos_premios = Cliente.query.filter(Cliente.puntos >= 150).all()
    return render_template('ia_kalu.html', stock_bajo=stock_bajo, proximos_premios=proximos_premios)

@ia_kalu_bp.route('/ia-consultar', methods=['POST'])
@login_required
def consultar_ia():
    data = request.get_json(silent=True) or {}
    pregunta = data.get('pregunta')
    gemini_key = os.getenv('GEMINI_API_KEY')
    
    if not gemini_key:
        return jsonify({
            "respuesta": "Epa camarita, no has configurado tu clave de API de Gemini (`GEMINI_API_KEY`) en el archivo `.env`. ¡Búscala en Google AI Studio y agrégala para que conversemos!"
        })
    
    # Contexto llanero y económico
    contexto = "Eres Kalu-IA, asistente en Guárico. Responde como un llanero serio y directo. Usa 'Epa Juan', 'Camarita', 'Plomo'. Ayuda con el negocio."
    prompt = f"{contexto}\n\nPregunta del usuario: {pregunta}"
    
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "temperature": 0.7
        }
    }
    
    success, res_json = llamar_gemini_api(gemini_key, payload)
    
    if success:
        if 'candidates' in res_json and len(res_json['candidates']) > 0:
            resultado = res_json['candidates'][0]['content']['parts'][0]['text']
        else:
            logger.debug(f"DEBUG GEMINI: {res_json}")
            resultado = "Epa Juan, recibí una respuesta inusual de Gemini. Revisa los logs de la consola."
    else:
        error_msg = res_json.get('error', {}).get('message', 'Error de API')
        resultado = f"Epa camarita, la IA de Gemini reporta un error: {error_msg}"

    return jsonify({"respuesta": resultado})

# ==========================================================
# 🛡️ HELPER DE LLAMADAS A GEMINI CON SOPORTE DE FALLBACK DE MODELOS
# ==========================================================
def llamar_gemini_api(gemini_key, payload, timeout=45):
    # Lista de modelos de respaldo en orden de prioridad
    modelos = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-flash-latest",
        "gemini-pro-latest"
    ]
    
    ultimo_error = None
    
    for modelo in modelos:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent?key={gemini_key}"
        headers = {"Content-Type": "application/json"}
        
        try:
            logger.info(f"Intentando llamada a Gemini usando modelo: {modelo}")
            response = requests.post(url, headers=headers, json=payload, timeout=timeout)
            res_json = response.json()
            
            # Si hay error en la respuesta de Gemini
            if 'error' in res_json:
                code = res_json['error'].get('code')
                msg = res_json['error'].get('message', '')
                status = res_json['error'].get('status', '')
                logger.warning(f"El modelo {modelo} devolvió error {code} ({status}): {msg}. Intentando fallback...")
                ultimo_error = res_json
                
                # Si es un error de autenticación/clave inválida (400 / INVALID_ARGUMENT), no tiene sentido probar otros modelos
                if code == 400 or status in ['INVALID_ARGUMENT', 'UNAUTHENTICATED']:
                    if "API key" in msg or "not valid" in msg or "key" in msg.lower():
                        return False, res_json
                
                # Para cualquier otro error (503, 429, 404, etc.), hacemos fallback al siguiente modelo
                continue
                    
            return True, res_json
            
        except Exception as e:
            logger.error(f"Excepción llamando al modelo {modelo}: {e}")
            ultimo_error = {"error": {"code": 500, "message": str(e)}}
            continue
            
    return False, ultimo_error


# ==========================================================
# 📊 REPORTE INTELIGENTE SEMANAL (Ahorro de Créditos)
# ==========================================================
@ia_kalu_bp.route('/reporte-semanal')
@login_required
def reporte_semanal():
    # Solo dueños o admins deberían verlo
    if current_user.role not in ['admin', 'dueno']:
        return "Acceso denegado. Solo administradores pueden ver este reporte.", 403

    archivo_cache = os.path.join(current_app.instance_path, 'ultimo_reporte_ia.json')
    hoy = date.today()
    
    # 1. CARGAR CACHÉ SI EXISTE Y ES RECIENTE (menos de 7 días)
    if os.path.exists(archivo_cache):
        try:
            with open(archivo_cache, 'r', encoding='utf-8') as f:
                datos = json.load(f)
                fecha_cache = datetime.strptime(datos.get('fecha', '2000-01-01'), '%Y-%m-%d').date()
                # Si el reporte tiene menos de 7 días, lo mostramos de una vez para NO gastar API
                if (hoy - fecha_cache).days < 7:
                    return render_template('reporte_ia_semanal.html', reporte_html=datos.get('html'), fecha=fecha_cache.strftime("%d/%m/%Y"), cached=True)
        except Exception as e:
            logger.error(f"Error leyendo cache de IA: {e}")

    # 2. SI NO HAY CACHÉ O EXPIRÓ, GENERAMOS DATOS DE LA DB
    from sqlalchemy import func
    
    # Alta y baja rotación (15 de cada uno)
    mas_vendidos = db.session.query(Producto.nombre, func.sum(DetalleVenta.cantidad).label('total'))\
        .join(DetalleVenta, Producto.id == DetalleVenta.producto_id)\
        .group_by(Producto.nombre)\
        .order_by(func.sum(DetalleVenta.cantidad).desc()).limit(15).all()
        
    menos_vendidos = db.session.query(Producto.nombre, func.sum(DetalleVenta.cantidad).label('total'))\
        .join(DetalleVenta, Producto.id == DetalleVenta.producto_id)\
        .group_by(Producto.nombre)\
        .order_by(func.sum(DetalleVenta.cantidad).asc()).limit(15).all()

    sin_stock = Producto.query.filter(Producto.stock <= 0).limit(20).all()

    # Contabilidad ultimos 7 dias
    reporte_dias = []
    total_ventas_semana = Decimal('0.00')
    total_costos_semana = Decimal('0.00')
    total_utilidad_semana = Decimal('0.00')

    for i in range(6, -1, -1):
        dia = hoy - timedelta(days=i)
        ventas_dia = Venta.query.filter(func.date(Venta.fecha) == dia).all()
        
        t_ventas = sum([seguro_decimal(v.total_usd) for v in ventas_dia], Decimal('0.00'))
        c_dia = Decimal('0.00')
        
        for v in ventas_dia:
            for d in v.detalles:
                costo = d.producto.costo_usd if d.producto and d.producto.costo_usd else Decimal('0.00')
                c_dia += costo * seguro_decimal(d.cantidad)
                
        utilidad = t_ventas - c_dia
        total_ventas_semana += t_ventas
        total_costos_semana += c_dia
        total_utilidad_semana += utilidad
        
        reporte_dias.append(f"| {dia.strftime('%d/%m/%Y')} | ${t_ventas:,.2f} | ${c_dia:,.2f} | ${utilidad:,.2f} |")

    # 3. PREPARAMOS EL PROMPT (REPORTE EJECUTIVO CFO)
    prompt_datos = f"""
Actúa como un Auditor Financiero. Genera un reporte semanal corporativo para KALU. 
Sé breve, usa Markdown y tablas.

### DESEMPEÑO DE LA SEMANA:
| Fecha | Ingresos | Margen |
|-------|----------|--------|
""" + "\n".join([f"| {dia[:12]} | {dia[15:30]} | {dia[45:]} |" for dia in reporte_dias]) + f"""

### RESUMEN FINANCIERO:
- INGRESOS: ${total_ventas_semana:,.2f}
- UTILIDAD: ${total_utilidad_semana:,.2f}

### INVENTARIO:
- TOP VENTAS: {", ".join([f"{p[0]}" for p in mas_vendidos])}
- SIN STOCK: {", ".join([p.nombre for p in sin_stock])}

Dame 3 recomendaciones comerciales breves para mejorar las ventas.
"""

    gemini_key = os.getenv('GEMINI_API_KEY')
    if not gemini_key:
        return render_template('reporte_ia_semanal.html', 
                               reporte_html="<h3>⚠️ Falta configurar la variable `GEMINI_API_KEY` en el archivo `.env`.</h3>", 
                               fecha=hoy.strftime("%d/%m/%Y"), cached=False)

    payload = {
        "contents": [{
            "parts": [{"text": prompt_datos}]
        }],
        "generationConfig": {
            "temperature": 0.2
        }
    }
    
    # 4. LLAMADA A LA API
    success, res_json = llamar_gemini_api(gemini_key, payload, timeout=45)
    if success:
        if 'candidates' in res_json and len(res_json['candidates']) > 0:
            resultado_ia = res_json['candidates'][0]['content']['parts'][0]['text']
        else:
            error_detalles = f"Estructura inesperada de Gemini: {res_json}"
            logger.error(error_detalles)
            resultado_ia = error_detalles
    else:
        error_msg = res_json.get('error', {}).get('message', 'Error de API')
        resultado_ia = f"Error Gemini Comunicación: {error_msg}"


    # Guardamos en caché
    if not resultado_ia.startswith("Error"):
        datos_cache = {
            "fecha": hoy.strftime("%Y-%m-%d"),
            "html": resultado_ia 
        }
        
        os.makedirs(current_app.instance_path, exist_ok=True)
        with open(archivo_cache, 'w', encoding='utf-8') as f:
            json.dump(datos_cache, f, ensure_ascii=False)

    return render_template('reporte_ia_semanal.html', reporte_html=resultado_ia, fecha=hoy.strftime("%d/%m/%Y"), cached=False)

# ==========================================================
# 📸 ESCÁNER DE FACTURAS CON IA (VISION)
# ==========================================================
@ia_kalu_bp.route('/ia-escanear-factura', methods=['POST'])
@login_required
def escanear_factura():
    data = request.get_json(silent=True) or {}
    imagen_b64 = data.get('imagen')
    
    if not imagen_b64:
        return jsonify({"success": False, "error": "No se recibió la imagen"}), 400

    gemini_key = os.getenv('GEMINI_API_KEY')
    if not gemini_key:
        return jsonify({
            "success": False, 
            "error": "No se ha configurado la variable de entorno `GEMINI_API_KEY` en el archivo `.env`"
        }), 400

    # Prompt para estructurar el JSON exacto
    prompt = """Actúa como un experto contable. Analiza la imagen de la factura adjunta.
    Extrae CADA producto en una lista JSON. 
    Formato requerido:
    {
      "productos": [
        {"nombre": "Nombre del producto", "cantidad": 1.0, "costo": 0.0}
      ]
    }
    IMPORTANTE: 
    - El costo debe ser el unitario.
    - Si no estás seguro de un valor, pon 0.0.
    - Responde ÚNICAMENTE con el objeto JSON, sin formato de markdown ni explicaciones adicionales."""

    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {
                    "inlineData": {
                        "mimeType": "image/jpeg",
                        "data": imagen_b64
                    }
                }
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json"
        }
    }

    try:
        success, res_json = llamar_gemini_api(gemini_key, payload, timeout=90)
        
        if success:
            content = ""
            if 'candidates' in res_json and len(res_json['candidates']) > 0:
                content = res_json['candidates'][0]['content']['parts'][0]['text']
            
            if not content:
                logger.error(f"Estructura vacía de Gemini: {res_json}")
                return jsonify({"success": False, "error": "Gemini no retornó contenido legible"}), 500
            
            data_ia = json.loads(content)
            return jsonify({"success": True, "productos": data_ia.get("productos", [])})
        else:
            error_msg = res_json.get('error', {}).get('message', 'Error de API')
            logger.error(f"Error llamando a Gemini para escanear factura: {res_json}")
            return jsonify({"success": False, "error": f"Error de Gemini: {error_msg}"}), 500

    except Exception as e:
        logger.error(f"Error procesando factura con IA Gemini: {e}")
        return jsonify({"success": False, "error": str(e)}), 500