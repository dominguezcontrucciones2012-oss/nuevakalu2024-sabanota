import os
import json
import logging
import requests
import pandas as pd
from datetime import datetime
from decimal import Decimal
from flask import Blueprint, render_template, request, jsonify, flash, redirect, url_for, current_app
from flask_login import login_required, current_user
from models import db, Producto, AuditoriaInventario
from utils import seguro_decimal
from functools import wraps
from flask import abort
import difflib
from routes.ia_kalu import llamar_gemini_api


ia_inventario_bp = Blueprint('ia_inventario', __name__)
logger = logging.getLogger('KALU.ia_inventario')

CATEGORIAS_OFICIALES = [
    "VÍVERES",
    "REPUESTOS DE MOTO",
    "CARNICERÍA",
    "PRODUCTORES / AGRÍCOLA",
    "FERRETERÍA",
    "GENÉRICOS"
]

# ============================================================
# 🔒 DECORADOR DE SEGURIDAD
# ============================================================
def solo_admin(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            flash("⚠️ Debes iniciar sesión primero.", "warning")
            return redirect(url_for('auth.ingresar'))
        if current_user.role not in ['admin', 'supervisor', 'dueno']:
            flash("🚫 No tienes permiso para acceder a esta sección.", "danger")
            abort(403)
        return f(*args, **kwargs)
    return decorated_function

# ============================================================
# 📦 VISTA PRINCIPAL
# ============================================================
@ia_inventario_bp.route('/ia-inventario')
@login_required
@solo_admin
def index():
    return render_template('ia_inventario.html', categorias=CATEGORIAS_OFICIALES)

# ============================================================
# 🤖 HEURÍSTICAS LOCALES PARA AUDITAR
# ============================================================
def detectar_anomalias_locales():
    productos = Producto.query.all()
    anomalias = []
    
    # 1. Buscar categorías corruptas o no oficiales
    for p in productos:
        cat = p.categoria
        razones = []
        sugerencia_cat = None
        sugerencia_nombre = None
        sugerencia_precio = None
        
        # Categoria
        if not cat:
            razones.append("Categoría vacía")
            sugerencia_cat = "GENÉRICOS"
        elif cat.strip().upper() not in CATEGORIAS_OFICIALES:
            razones.append(f"Categoría no oficial: '{cat}'")
            # Intento de mapeo básico
            c_upper = cat.strip().upper()
            if "VIVERES" in c_upper or "VIVERE" in c_upper:
                sugerencia_cat = "VÍVERES"
            elif "REPUESTO" in c_upper or "MOTO" in c_upper:
                sugerencia_cat = "REPUESTOS DE MOTO"
            elif "CARNE" in c_upper or "CARNICERIA" in c_upper or "CHORIZO" in c_upper:
                sugerencia_cat = "CARNICERÍA"
            elif "PRODUCTOR" in c_upper or "AGRICOLA" in c_upper or "QUESO" in c_upper or "LECHE" in c_upper:
                sugerencia_cat = "PRODUCTORES / AGRÍCOLA"
            elif "FERRETERIA" in c_upper or "TORNILLO" in c_upper or "HERRAMIENTA" in c_upper:
                sugerencia_cat = "FERRETERÍA"
            else:
                sugerencia_cat = "GENÉRICOS"

        # Nombre
        nombre = p.nombre
        if nombre and any(c.islower() for c in nombre):
            razones.append("Nombre con minúsculas")
            sugerencia_nombre = nombre.strip().upper()
            
        # Precios
        costo = p.costo_usd or Decimal('0.00')
        precio = p.precio_normal_usd or Decimal('0.00')
        
        if costo <= 0:
            razones.append("Costo es cero o negativo")
        if precio <= 0:
            razones.append("Precio es cero o negativo")
        elif costo >= precio:
            razones.append(f"Costo (${costo:.2f}) es mayor o igual al precio normal (${precio:.2f})")
            sugerencia_precio = (costo * Decimal('1.30')).quantize(Decimal('0.01')) # sugerir 30% ganancia
        else:
            # Calcular margen
            margin = ((precio - costo) / costo) * 100 if costo > 0 else 0
            if margin < 10:
                razones.append(f"Margen muy bajo ({margin:.1f}%)")
                sugerencia_precio = (costo * Decimal('1.30')).quantize(Decimal('0.01'))
            elif margin > 150:
                razones.append(f"Margen sospechosamente alto ({margin:.1f}%)")
                
        if razones:
            anomalias.append({
                "id": p.id,
                "codigo": p.codigo,
                "nombre": p.nombre,
                "categoria": p.categoria or "Ninguna",
                "costo": float(costo),
                "precio": float(precio),
                "stock": float(p.stock),
                "razones": ", ".join(razones),
                "sugerencia_cat": sugerencia_cat or p.categoria,
                "sugerencia_nombre": sugerencia_nombre or p.nombre,
                "sugerencia_precio": float(sugerencia_precio) if sugerencia_precio else float(precio)
            })
            
    return anomalias

# ============================================================
# 🤖 BUSCAR DUPLICADOS LOCALES
# ============================================================
def buscar_duplicados_locales():
    productos = Producto.query.all()
    duplicados = []
    vistos = set()
    
    # 1. Duplicidad por nombre similar
    for i, p1 in enumerate(productos):
        if p1.id in vistos:
            continue
        for j in range(i + 1, len(productos)):
            p2 = productos[j]
            if p2.id in vistos:
                continue
            
            # Comparar nombres normalizados
            n1 = p1.nombre.strip().upper()
            n2 = p2.nombre.strip().upper()
            
            # Ignorar si son idénticos id y código
            if p1.codigo == p2.codigo:
                continue
                
            # Ratio de similitud
            ratio = difflib.SequenceMatcher(None, n1, n2).ratio()
            if ratio > 0.85 or (len(n1) > 4 and len(n2) > 4 and (n1 in n2 or n2 in n1) and ratio > 0.75):
                duplicados.append({
                    "p1": {
                        "id": p1.id,
                        "codigo": p1.codigo,
                        "nombre": p1.nombre,
                        "categoria": p1.categoria,
                        "stock": float(p1.stock),
                        "costo": float(p1.costo_usd or 0),
                        "precio": float(p1.precio_normal_usd or 0)
                    },
                    "p2": {
                        "id": p2.id,
                        "codigo": p2.codigo,
                        "nombre": p2.nombre,
                        "categoria": p2.categoria,
                        "stock": float(p2.stock),
                        "costo": float(p2.costo_usd or 0),
                        "precio": float(p2.precio_normal_usd or 0)
                    },
                    "ratio": round(ratio * 100, 1),
                    "razon": f"Nombres muy similares ({round(ratio*100)}% de coincidencia)"
                })
                # No marcamos vistos inmediatamente para poder ver otras posibles coincidencias, 
                # pero evitamos saturar
                if len(duplicados) >= 40:
                    break
        if len(duplicados) >= 40:
            break
            
    return duplicados

# ============================================================
# 🤖 LLAMADA A GEMINI PARA REFINAR ANOMALÍAS
# ============================================================
def refinar_con_gemini(anomalias):
    gemini_key = os.getenv('GEMINI_API_KEY')
    if not gemini_key:
        logger.warning("No GEMINI_API_KEY found, returning heuristic suggestions.")
        return anomalias # Fallback a las sugerencias de la heurística

    # Preparar el prompt
    items_to_send = []
    for item in anomalias[:50]: # Enviar máximo 50 a la vez por tokens y velocidad
        items_to_send.append({
            "id": item["id"],
            "nombre": item["nombre"],
            "categoria_actual": item["categoria"],
            "costo": item["costo"],
            "precio_actual": item["precio"]
        })
        
    categorias_str = ", ".join(CATEGORIAS_OFICIALES)
    
    prompt = f"""
Actúa como un Auditor de Inventario y Experto en Base de Datos de Retail.
Tengo una lista de productos con inconsistencias de datos (nombres mal escritos, minúsculas, categorías incorrectas o ausentes).
Por favor, analiza cada producto y devuélveme una lista en formato JSON con la corrección refinada.

Reglas del negocio:
1. El nombre del producto debe estar limpio, sin dobles espacios, corregido ortográficamente si hay errores tipográficos obvios y TODO EN MAYÚSCULAS.
2. La categoría debe ser exactamente una de estas: [{categorias_str}]. Si no encaja en las otras, pon "GENÉRICOS".
3. Si el costo es mayor a 0 y el precio es menor o igual al costo (o el margen es < 10%), sugiere un precio normal con un margen del 30% sobre el costo.

La salida debe ser estrictamente un objeto JSON con este formato (no añadas explicaciones de texto, markdown, ni nada fuera del bloque JSON):
{{
  "correcciones": [
    {{
      "id": 123,
      "nombre_sugerido": "ARROZ PRIMOR 1KG",
      "categoria_sugerida": "VÍVERES",
      "precio_sugerido": 1.95,
      "razon": "Categoría corregida y capitalización corregida."
    }}
  ]
}}

Productos a auditar:
{json.dumps(items_to_send, ensure_ascii=False, indent=2)}
"""

    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json"
        }
    }

    try:
        success, res_json = llamar_gemini_api(gemini_key, payload, timeout=40)
        
        if success and 'candidates' in res_json and len(res_json['candidates']) > 0:
            text_response = res_json['candidates'][0]['content']['parts'][0]['text']
            data_ia = json.loads(text_response)
            
            # Combinar la sugerencia de la IA con la anomalia
            mapa_sugerencias = {c["id"]: c for c in data_ia.get("correcciones", [])}
            
            for item in anomalias:
                iid = item["id"]
                if iid in mapa_sugerencias:
                    sug = mapa_sugerencias[iid]
                    item["sugerencia_nombre"] = sug.get("nombre_sugerido", item["sugerencia_nombre"])
                    item["sugerencia_cat"] = sug.get("categoria_sugerida", item["sugerencia_cat"])
                    item["sugerencia_precio"] = float(sug.get("precio_sugerido", item["sugerencia_precio"]))
                    item["razon_ia"] = sug.get("razon", "Recomendado por Kalu-IA")
                else:
                    item["razon_ia"] = "Sugerencia por regla heurística"
        else:
            logger.error(f"Gemini API returned unexpected response: {res_json}")
            for item in anomalias:
                item["razon_ia"] = "Fallback heurístico (Error de API)"
    except Exception as e:
        logger.error(f"Error calling Gemini for inventory audit: {e}")
        for item in anomalias:
            item["razon_ia"] = f"Fallback heurístico (Error de conexión: {str(e)})"
            
    return anomalias

# ============================================================
# API: INICIAR ANÁLISIS DE LA DB
# ============================================================
@ia_inventario_bp.route('/api/ia-inventario/analizar', methods=['POST'])
@login_required
@solo_admin
def api_analizar():
    try:
        anomalias = detectar_anomalias_locales()
        duplicados = buscar_duplicados_locales()
        
        # Refinar con IA si hay anomalias
        if anomalias:
            anomalias = refinar_con_gemini(anomalias)
            
        return jsonify({
            "success": True,
            "anomalias": anomalias,
            "duplicados": duplicados
        })
    except Exception as e:
        logger.exception("Error en api_analizar")
        return jsonify({"success": False, "error": str(e)}), 500

# ============================================================
# API: APLICAR CORRECCIONES EN LOTE
# ============================================================
@ia_inventario_bp.route('/api/ia-inventario/corregir', methods=['POST'])
@login_required
@solo_admin
def api_corregir():
    data = request.get_json(silent=True) or {}
    correcciones = data.get("correcciones", [])
    
    if not correcciones:
        return jsonify({"success": False, "error": "No se enviaron correcciones."}), 400
        
    aplicados = 0
    errores = 0
    
    for c in correcciones:
        try:
            pid = c.get("id")
            prod = Producto.query.get(pid)
            if not prod:
                errores += 1
                continue
                
            antes_nombre = prod.nombre
            antes_cat = prod.categoria
            antes_precio = prod.precio_normal_usd
            
            # Aplicar cambios aprobados
            prod.nombre = c.get("nombre").strip().upper()
            prod.categoria = c.get("categoria")
            prod.precio_normal_usd = seguro_decimal(c.get("precio"))
            
            # Auditoría
            db.session.add(AuditoriaInventario(
                usuario_id=current_user.id,
                usuario_nombre=current_user.username,
                producto_id=prod.id,
                producto_nombre=prod.nombre,
                accion='IA_CORRECCION_ATRIBUTOS',
                cantidad_antes=prod.stock,
                cantidad_despues=prod.stock,
                fecha=datetime.now()
            ))
            aplicados += 1
        except Exception as e:
            logger.error(f"Error aplicando correccion a producto ID {c.get('id')}: {e}")
            errores += 1
            
    if aplicados > 0:
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({"success": False, "error": f"Error en BD al guardar cambios: {str(e)}"}), 500
            
    return jsonify({
        "success": True,
        "aplicados": aplicados,
        "errores": errores
    })

# ============================================================
# API: FUSIONAR DUPLICADOS
# ============================================================
@ia_inventario_bp.route('/api/ia-inventario/fusionar', methods=['POST'])
@login_required
@solo_admin
def api_fusionar():
    data = request.get_json(silent=True) or {}
    id_conservar = data.get("id_conservar")
    id_eliminar = data.get("id_eliminar")
    
    if not id_conservar or not id_eliminar:
        return jsonify({"success": False, "error": "Faltan parámetros de fusión."}), 400
        
    p_conservar = Producto.query.get(id_conservar)
    p_eliminar = Producto.query.get(id_eliminar)
    
    if not p_conservar or not p_eliminar:
        return jsonify({"success": False, "error": "Uno o ambos productos no existen."}), 404
        
    try:
        stock_antes_conservar = p_conservar.stock
        stock_eliminar = p_eliminar.stock
        
        # Sumar el stock al producto que se conserva
        p_conservar.stock += stock_eliminar
        
        # Auditoría de fusión en el conservado
        db.session.add(AuditoriaInventario(
            usuario_id=current_user.id,
            usuario_nombre=current_user.username,
            producto_id=p_conservar.id,
            producto_nombre=p_conservar.nombre,
            accion='IA_FUSION_COMPLETA_ORIGEN',
            cantidad_antes=stock_antes_conservar,
            cantidad_despues=p_conservar.stock,
            fecha=datetime.now()
        ))
        
        # Auditoría en el eliminado
        db.session.add(AuditoriaInventario(
            usuario_id=current_user.id,
            usuario_nombre=current_user.username,
            producto_id=p_eliminar.id,
            producto_nombre=p_eliminar.nombre,
            accion='IA_FUSION_BORRADO',
            cantidad_antes=stock_eliminar,
            cantidad_despues=0,
            fecha=datetime.now()
        ))
        
        # Eliminar el producto duplicado
        db.session.delete(p_eliminar)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "mensaje": f"Fusión exitosa. Se conservó '{p_conservar.nombre}' y se le sumó {stock_eliminar} de stock."
        })
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al fusionar productos: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

# ============================================================
# CARGAR EXCEL Y REFINAR CON IA (PREVIO A DB)
# ============================================================
@ia_inventario_bp.route('/ia-inventario/cargar-excel', methods=['POST'])
@login_required
@solo_admin
def cargar_excel_ia():
    file = request.files.get('archivo')
    if not file:
        return jsonify({"success": False, "error": "No se subió ningún archivo."}), 400
        
    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        return jsonify({"success": False, "error": "Formato de archivo inválido. Utilice .xlsx o .xls."}), 400
        
    try:
        df = pd.read_excel(file)
        # Estandarizar nombres de columnas a minúsculas y quitar espacios
        df.columns = [str(c).strip().lower() for c in df.columns]
        
        # Validar columnas mínimas requeridas
        columnas_requeridas = ['codigo', 'nombre', 'categoria', 'costo_usd', 'precio_normal_usd']
        columnas_faltantes = [col for col in columnas_requeridas if col not in df.columns]
        if columnas_faltantes:
            return jsonify({
                "success": False, 
                "error": f"Faltan columnas requeridas en el archivo: {', '.join(columnas_faltantes)}"
            }), 400
            
        filas_procesadas = []
        filas_para_ia = []
        
        for idx, row in df.iterrows():
            codigo = str(row.get('codigo', '')).strip()
            nombre = str(row.get('nombre', '')).strip()
            
            if not codigo or not nombre or codigo == 'nan' or nombre == 'nan':
                continue
                
            categoria = str(row.get('categoria', '') or '').strip()
            costo = seguro_decimal(row.get('costo_usd', 0))
            precio = seguro_decimal(row.get('precio_normal_usd', 0))
            stock = seguro_decimal(row.get('stock', 0))
            stock_min = int(row.get('stock_minimo', 5) or 5)
            precio_oferta = seguro_decimal(row.get('precio_oferta_usd', 0))
            
            # Verificación rápida local de anomalías en la fila del Excel
            anomala = False
            razones = []
            sugerencia_cat = categoria
            sugerencia_nombre = nombre
            sugerencia_precio = precio
            
            if not categoria or categoria.upper() not in CATEGORIAS_OFICIALES:
                anomala = True
                razones.append("Categoría inválida")
                # Intento mapeo heurístico
                c_upper = categoria.upper()
                if "VIVERES" in c_upper or "VIVERE" in c_upper:
                    sugerencia_cat = "VÍVERES"
                elif "REPUESTO" in c_upper or "MOTO" in c_upper:
                    sugerencia_cat = "REPUESTOS DE MOTO"
                elif "CARNE" in c_upper or "CARNICERIA" in c_upper:
                    sugerencia_cat = "CARNICERÍA"
                elif "PRODUCTOR" in c_upper or "AGRICOLA" in c_upper:
                    sugerencia_cat = "PRODUCTORES / AGRÍCOLA"
                elif "FERRETERIA" in c_upper:
                    sugerencia_cat = "FERRETERÍA"
                else:
                    sugerencia_cat = "GENÉRICOS"
                    
            if any(c.islower() for c in nombre):
                anomala = True
                razones.append("Nombre con minúsculas")
                sugerencia_nombre = nombre.upper()
                
            if costo >= precio or precio <= 0:
                anomala = True
                razones.append("Margen nulo o negativo")
                sugerencia_precio = (costo * Decimal('1.30')).quantize(Decimal('0.01'))
                
            item_data = {
                "index": idx,
                "codigo": codigo,
                "nombre_original": nombre,
                "nombre_sugerido": sugerencia_nombre,
                "categoria_original": categoria,
                "categoria_sugerido": sugerencia_cat,
                "costo": float(costo),
                "precio_original": float(precio),
                "precio_sugerido": float(sugerencia_precio),
                "precio_oferta": float(precio_oferta),
                "stock": float(stock),
                "stock_minimo": stock_min,
                "anomala": anomala,
                "razon": ", ".join(razones) if razones else "Datos Correctos",
                "aplicar": True
            }
            
            filas_procesadas.append(item_data)
            if anomala:
                filas_para_ia.append({
                    "index": idx,
                    "nombre": nombre,
                    "categoria": categoria,
                    "costo": float(costo),
                    "precio": float(precio)
                })
                
        # Si hay filas anómalas y tenemos clave de Gemini, refinamos con IA
        gemini_key = os.getenv('GEMINI_API_KEY')
        if gemini_key and filas_para_ia:
            try:
                categorias_str = ", ".join(CATEGORIAS_OFICIALES)
                prompt = f"""
Actúa como un Auditor de Inventario y Experto en Base de Datos de Retail.
Tengo una lista de productos provenientes de un archivo Excel que tienen errores de formato, categorías incorrectas o márgenes de precio erróneos.
Por favor, analiza cada producto y devuélveme una lista en formato JSON con la corrección refinada.

Reglas del negocio:
1. El nombre del producto debe estar limpio, sin dobles espacios, corregido ortográficamente si hay errores tipográficos obvios y TODO EN MAYÚSCULAS.
2. La categoría debe ser exactamente una de estas: [{categorias_str}]. Si no encaja en las otras, pon "GENÉRICOS".
3. Si el costo es mayor a 0 y el precio es menor o igual al costo (o el margen es < 10%), sugiere un precio normal con un margen del 30% sobre el costo.

La salida debe ser estrictamente un objeto JSON con este formato:
{{
  "correcciones": [
    {{
      "index": 0,
      "nombre_sugerido": "HARINA PAN 1KG",
      "categoria_sugerida": "VÍVERES",
      "precio_sugerido": 1.95,
      "razon": "Categoría y mayúsculas corregidas."
    }}
  ]
}}

Productos de Excel a auditar:
{json.dumps(filas_para_ia[:50], ensure_ascii=False, indent=2)}
"""
                payload = {
                    "contents": [{
                        "parts": [{"text": prompt}]
                    }],
                    "generationConfig": {
                        "temperature": 0.1,
                        "responseMimeType": "application/json"
                    }
                }
                
                success, res_json = llamar_gemini_api(gemini_key, payload, timeout=30)
                
                if success and 'candidates' in res_json and len(res_json['candidates']) > 0:
                    text_response = res_json['candidates'][0]['content']['parts'][0]['text']
                    data_ia = json.loads(text_response)
                    
                    mapa_ia = {c["index"]: c for c in data_ia.get("correcciones", [])}
                    
                    for fila in filas_procesadas:
                        fidx = fila["index"]
                        if fidx in mapa_ia:
                            c_ia = mapa_ia[fidx]
                            fila["nombre_sugerido"] = c_ia.get("nombre_sugerido", fila["nombre_sugerido"])
                            fila["categoria_sugerido"] = c_ia.get("categoria_sugerida", fila["categoria_sugerido"])
                            fila["precio_sugerido"] = float(c_ia.get("precio_sugerido", fila["precio_sugerido"]))
                            fila["razon"] = c_ia.get("razon", fila["razon"]) + " (IA)"
                
            except Exception as ex:
                logger.error(f"Error llamando a Gemini para corregir Excel: {ex}")
                
        return jsonify({
            "success": True,
            "filas": filas_procesadas
        })
        
    except Exception as e:
        logger.exception("Error procesando Excel en cargar_excel_ia")
        return jsonify({"success": False, "error": str(e)}), 500

# ============================================================
# API: GUARDAR FILAS DE EXCEL CONFIRMADAS EN LA DB
# ============================================================
@ia_inventario_bp.route('/api/ia-inventario/confirmar-excel', methods=['POST'])
@login_required
@solo_admin
def confirmar_excel_ia():
    data = request.get_json(silent=True) or {}
    filas = data.get("filas", [])
    
    if not filas:
        return jsonify({"success": False, "error": "No se enviaron datos para guardar."}), 400
        
    creados = 0
    actualizados = 0
    errores = 0
    
    for f in filas:
        if not f.get("aplicar", True):
            continue
            
        try:
            codigo = str(f.get("codigo")).strip()
            nombre = str(f.get("nombre_sugerido") or f.get("nombre_original")).strip().upper()
            categoria = f.get("categoria_sugerido") or f.get("categoria_original")
            costo = seguro_decimal(f.get("costo", 0))
            precio = seguro_decimal(f.get("precio_sugerido") or f.get("precio_original", 0))
            precio_oferta = seguro_decimal(f.get("precio_oferta", 0))
            stock = seguro_decimal(f.get("stock", 0))
            stock_minimo = int(f.get("stock_minimo", 5) or 5)
            
            if not codigo or not nombre:
                errores += 1
                continue
                
            prod = Producto.query.filter_by(codigo=codigo).first()
            if prod:
                antes_stock = prod.stock
                prod.nombre = nombre
                prod.categoria = categoria
                prod.costo_usd = costo
                prod.precio_normal_usd = precio
                prod.precio_oferta_usd = precio_oferta
                prod.stock = stock
                prod.stock_minimo = stock_minimo
                actualizados += 1
                
                db.session.add(AuditoriaInventario(
                    usuario_id=current_user.id,
                    usuario_nombre=current_user.username,
                    producto_id=prod.id,
                    producto_nombre=prod.nombre,
                    accion='IA_EXCEL_IMPORT_UPDATE',
                    cantidad_antes=antes_stock,
                    cantidad_despues=prod.stock,
                    fecha=datetime.now()
                ))
            else:
                nuevo = Producto(
                    codigo=codigo,
                    nombre=nombre,
                    categoria=categoria,
                    costo_usd=costo,
                    precio_normal_usd=precio,
                    precio_oferta_usd=precio_oferta,
                    stock=stock,
                    stock_minimo=stock_minimo
                )
                db.session.add(nuevo)
                db.session.flush()
                
                db.session.add(AuditoriaInventario(
                    usuario_id=current_user.id,
                    usuario_nombre=current_user.username,
                    producto_id=nuevo.id,
                    producto_nombre=nuevo.nombre,
                    accion='IA_EXCEL_IMPORT_NUEVO',
                    cantidad_antes=0,
                    cantidad_despues=nuevo.stock,
                    fecha=datetime.now()
                ))
                creados += 1
                
        except Exception as ex:
            logger.error(f"Error guardando fila de Excel: {ex}")
            errores += 1
            
    try:
        db.session.commit()
        return jsonify({
            "success": True,
            "creados": creados,
            "actualizados": actualizados,
            "errores": errores
        })
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error al comprometer base de datos: {e}")
        return jsonify({"success": False, "error": f"Error al guardar en BD: {str(e)}"}), 500
