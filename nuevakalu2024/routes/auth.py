from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import check_password_hash
from models import db, User, Cliente
from routes.usuarios import crear_acceso_sistema
from datetime import datetime

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/politica-privacidad')
def privacidad():
    return render_template('privacidad.html')

@auth_bp.route('/terminos-servicio')
def terminos():
    return render_template('terminos.html')

@auth_bp.route('/ingresar', methods=['GET', 'POST'])
def ingresar():
    if current_user.is_authenticated:
        if current_user.role == 'cliente':
            return redirect(url_for('portal.mi_deuda'))
        elif current_user.role in ['productor', 'cajero'] and current_user.proveedor_id:
            return redirect(url_for('portal.mi_libreta'))
        return redirect(url_for('pos.pos'))
    
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password')
        
        # 1. Intento: Username exacto (como esté en DB)
        user = User.query.filter((User.username == username) | (User.email == username)).first()
        
        # 2. Intento: Normalización (Alfanumérico y Mayúsculas)
        if not user:
            username_norm = "".join(filter(str.isalnum, username)).upper()
            user = User.query.filter(User.username == username_norm).first()

        # 3. Intento: Sin Prefijo (Por si el usuario pone V- o J- y en DB no está)
        if not user:
            # Si empieza por V, J, E, G o P y lo que sigue es un número, probamos sin la letra
            prefixes = ('V', 'J', 'E', 'G', 'P')
            username_clean = "".join(filter(str.isalnum, username)).upper()
            if username_clean.startswith(prefixes) and len(username_clean) > 1:
                sin_prefijo = username_clean[1:]
                if sin_prefijo.isdigit():
                    user = User.query.filter(User.username == sin_prefijo).first()
        
        # 4. Intento: Case-Insensitive (Búsqueda por nombre si se guardó en minúsculas)
        if not user:
            user = User.query.filter(User.username.ilike(username)).first()

        if user and check_password_hash(user.password, password):
            # 🔒 RESTRICCIÓN DE SEGURIDAD: Solo el personal administrativo está obligado a usar Google o Código de Barras
            # Los CLIENTES y PRODUCTORES pueden seguir entrando con su Usuario/Clave normal
            if user.role not in ['cliente', 'productor', 'cajero'] and user.username != 'juancarlos':
                flash("🔒 Por seguridad, el acceso administrativo es vía Google o Código de Barras.", "warning")
                return redirect(url_for('auth.ingresar'))

            # 🔒 Verificar que el usuario esté activo
            if not getattr(user, 'activo', True):
                flash("❌ Esta cuenta ha sido desactivada. Comuníquese con el administrador.", "danger")
                return redirect(url_for('auth.ingresar'))

            login_user(user)
            flash(f"👋 ¡Bienvenido de nuevo, {user.username}!", "success")
            
            next_page = request.args.get('next')
            if next_page and next_page.startswith('/'):
                return redirect(next_page)

            if user.role == 'cliente':
                return redirect(url_for('portal.mi_deuda'))
            elif user.role in ['productor', 'cajero'] and user.proveedor_id:
                return redirect(url_for('portal.mi_libreta'))
            
            return redirect(url_for('pos.pos'))
        else:
            flash("❌ Usuario o contraseña incorrectos.", "danger")
            
    return render_template('login.html')

@auth_bp.route('/barcode-login', methods=['POST'])
def barcode_login():
    data = request.get_json(silent=True) or {}
    codigo = data.get('codigo')
    
    # Mapeo de códigos a usuarios (Códigos ultra cortos de 4 dígitos)
    mapeo = {
        '1001': '28241058',   # Diana Aponte
        '1002': '31107381',   # Andres Eloy
        '1003': 'deisy.coromoto',
        '1004': 'juancarlos',
        '7788': 'juancarlos', # 🔑 CÓDIGO MAESTRO DE EMERGENCIA
        'KALU-LLAVE-MAESTRA-LOGIN': 'juancarlos' # Alias para compatibilidad
    }
    
    username = mapeo.get(codigo)
    if username:
        user = User.query.filter_by(username=username).first()
        if user:
            # 🔒 Verificar que el usuario esté activo
            if not getattr(user, 'activo', True):
                return jsonify({'success': False, 'message': '❌ Esta cuenta ha sido desactivada'}), 403
            login_user(user)
            # Redirección inteligente según el rol
            redirect_to = url_for('pos.pos')
            if user.role == 'admin': 
                redirect_to = url_for('reportes.panel_reportes')
            elif user.role == 'dueno': 
                redirect_to = url_for('dueno.dashboard')
            elif user.role == 'productor':
                redirect_to = url_for('portal.mi_libreta')
            elif user.role == 'cliente':
                redirect_to = url_for('portal.mi_deuda')
            
            return jsonify({'success': True, 'message': f'🔓 Acceso concedido: {user.nombre_completo or user.username}', 'redirect': redirect_to})
    
    return jsonify({'success': False, 'message': '❌ Código inválido'}), 401

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash("🔒 Sesión cerrada correctamente.", "info")
    return redirect(url_for('auth.ingresar'))

# ============================================================
# 📝 AUTOREGISTRO DE CLIENTES (SIN MOLESTAR AL ADMIN)
# ============================================================
@auth_bp.route('/registro', methods=['GET', 'POST'])
def registro():
    if current_user.is_authenticated:
        return redirect(url_for('index'))

    if request.method == 'POST':
        nombre = request.form.get('nombre', '').strip().upper()
        cedula = request.form.get('cedula', '').strip().upper()
        telefono = request.form.get('telefono', '').strip()
        f_nac_str = request.form.get('fecha_nacimiento')

        if not nombre or not cedula or not f_nac_str:
            flash("⚠️ Nombre, Cédula y Fecha de Nacimiento son obligatorios.", "warning")
            return redirect(url_for('auth.registro'))

        # Limpiar cédula
        cedula_norm = "".join(filter(str.isalnum, cedula)).upper()

        # Verificar si ya existe el cliente
        existe_cliente = Cliente.query.filter_by(cedula=cedula_norm).first()
        if existe_cliente:
            flash(f"ℹ️ Ya estás registrado como {existe_cliente.nombre}. ¡Solo tienes que ingresar!", "info")
            return redirect(url_for('auth.ingresar'))

        try:
            f_nac = datetime.strptime(f_nac_str, '%Y-%m-%d').date()
            
            # 1. Crear el Cliente
            nuevo_cliente = Cliente(
                nombre=nombre,
                cedula=cedula_norm,
                telefono=telefono or None,
                fecha_nacimiento=f_nac,
                puntos=20 # Regalo de bienvenida
            )
            db.session.add(nuevo_cliente)
            db.session.flush()

            # 2. Crear el Usuario automáticamente
            username, status = crear_acceso_sistema(nuevo_cliente, 'cliente', commit=False)
            
            # Buscamos al usuario recién creado para loguearlo
            user = User.query.filter_by(username=username).first()
            
            db.session.commit()
            
            if user:
                login_user(user)
                flash(f"✨ ¡Bienvenido a KALU, {nombre}! Tu cuenta ha sido creada.\n👤 Usuario: {username}\n🔑 Clave: Los últimos 4 números de tu cédula.", "success")
                return redirect(url_for('portal.mi_deuda'))
            
            flash("✅ Registro exitoso. Ahora puedes ingresar con tu cédula.", "success")
            return redirect(url_for('auth.ingresar'))

        except Exception as e:
            db.session.rollback()
            flash(f"❌ Error en el registro: {str(e)}", "danger")
            return redirect(url_for('auth.registro'))

    return render_template('registro.html')

# ============================================================
# 🌐 GOOGLE LOGIN ROUTES
# ============================================================

@auth_bp.route('/ingresar/google')
@auth_bp.route('/login/google')
def ingresar_google():
    from app import google
    # Flask genera automáticamente la URL completa con _external=True
    # respetando el host y puerto configurados o detectados por ProxyFix.
    redirect_uri = url_for('auth.callback_google', _external=True)
    return google.authorize_redirect(redirect_uri, prompt='select_account')

@auth_bp.route('/auth/callback-google') # 👈 Ruta única y estandarizada
def callback_google():
    from app import google
    try:
        token = google.authorize_access_token()
        user_info = token.get('userinfo')
        
        if not user_info:
            user_info = google.parse_id_token(token, nonce=None)

        if not user_info:
            flash("❌ No se pudo extraer información del perfil de Google.", "danger")
            return redirect(url_for('auth.ingresar'))

        email = user_info.get('email')
        google_id = user_info.get('sub')

        # Buscar usuario por email
        user = User.query.filter_by(email=email).first()

        if user:
            # 🔒 RESTRICCIÓN DE SEGURIDAD: Solo Dueños y Administradores usan Google
            if user.role not in ['admin', 'dueno']:
                flash("⛔ ACCESO DENEGADO: El ingreso vía Google es exclusivo para el personal directivo. Personal de caja use Código de Barras.", "danger")
                return redirect(url_for('auth.ingresar'))

            # 🔒 Verificar que el usuario esté activo
            if not getattr(user, 'activo', True):
                flash("❌ Esta cuenta ha sido desactivada. Comuníquese con el administrador.", "danger")
                return redirect(url_for('auth.ingresar'))

            user.google_id = google_id
            db.session.commit()
            
            login_user(user)
            flash(f"👋 Acceso seguro vía Google: {user.username}", "success")
            
            if user.role == 'admin':
                return redirect(url_for('reportes.panel_reportes'))
            elif user.role == 'dueno':
                return redirect(url_for('dueno.dashboard'))
            elif user.role in ['cajero', 'supervisor']:
                return redirect(url_for('pos.pos'))
            elif user.role == 'cliente':
                return redirect(url_for('portal.mi_deuda'))
            elif user.role == 'productor':
                return redirect(url_for('portal.mi_libreta'))
            
            return redirect(url_for('pos.pos'))
        else:
            flash(f"⛔ ACCESO DENEGADO: El correo {email} NO TIENE PERMISO en KALU. Vincúlalo en la gestión de usuarios primero.", "danger")
            return redirect(url_for('auth.ingresar'))
            
    except Exception as e:
        import traceback
        print(f"Error Google Auth: {str(e)}")
        print(traceback.format_exc())
        flash(f"❌ Error en la autenticación de Google. Verifica tu conexión.", "danger")
        return redirect(url_for('auth.ingresar'))