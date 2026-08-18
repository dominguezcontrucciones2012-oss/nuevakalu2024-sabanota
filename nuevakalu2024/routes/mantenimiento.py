from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, current_app
from flask_login import login_required, current_user
from routes.decorators import staff_required
import os
import shutil
from datetime import datetime
from models import db

mantenimiento_bp = Blueprint('mantenimiento', __name__, url_prefix='/admin/mantenimiento')

BACKUP_DIR = 'backups'
DB_PATH = 'instance/kalu_master.db'

def check_admin():
    if current_user.role not in ['admin', 'dueno']:
        flash('⛔ No tienes permisos para realizar tareas de mantenimiento.', 'danger')
        return False
    return True

@mantenimiento_bp.route('/')
@login_required
@staff_required
def index():
    if not check_admin(): return redirect(url_for('pos.pos'))
    
    # Listar backups
    backups = []
    if os.path.exists(BACKUP_DIR):
        files = os.listdir(BACKUP_DIR)
        for f in files:
            if f.endswith('.db'):
                path = os.path.join(BACKUP_DIR, f)
                stats = os.stat(path)
                backups.append({
                    'nombre': f,
                    'fecha': datetime.fromtimestamp(stats.st_mtime).strftime('%Y-%m-%d %H:%M:%S'),
                    'tamano': f"{stats.st_size / 1024 / 1024:.2f} MB"
                })
    
    # Ordenar por fecha descendente
    backups.sort(key=lambda x: x['fecha'], reverse=True)
    
    return render_template('mantenimiento.html', backups=backups)

@mantenimiento_bp.route('/respaldar', methods=['POST'])
@login_required
@staff_required
def respaldar():
    if not check_admin(): return redirect(url_for('pos.pos'))
    
    try:
        if not os.path.exists(BACKUP_DIR):
            os.makedirs(BACKUP_DIR)
            
        now = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        dest = os.path.join(BACKUP_DIR, f"respaldo_manual_{now}.db")
        
        shutil.copy2(DB_PATH, dest)
        flash(f'✅ Respaldo creado exitosamente: {dest}', 'success')
    except Exception as e:
        flash(f'❌ Error al crear respaldo: {str(e)}', 'danger')
        
    return redirect(url_for('mantenimiento.index'))

@mantenimiento_bp.route('/restaurar/<filename>', methods=['POST'])
@login_required
@staff_required
def restaurar(filename):
    if not check_admin(): return redirect(url_for('pos.pos'))
    
    try:
        src = os.path.join(BACKUP_DIR, filename)
        if not os.path.exists(src):
            flash('❌ El archivo de respaldo no existe.', 'danger')
            return redirect(url_for('mantenimiento.index'))
            
        # 1. Crear respaldo preventivo del actual
        now = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        pre_restore = os.path.join(BACKUP_DIR, f"auto_antes_de_restaurar_{now}.db")
        shutil.copy2(DB_PATH, pre_restore)
        
        # 2. Restaurar
        shutil.copy2(src, DB_PATH)
        flash(f'✅ Base de datos restaurada desde {filename}. Se creó un respaldo preventivo.', 'success')
        
    except Exception as e:
        flash(f'❌ Error al restaurar: {str(e)}', 'danger')
        
    return redirect(url_for('mantenimiento.index'))

@mantenimiento_bp.route('/limpiar', methods=['POST'])
@login_required
@staff_required
def limpiar():
    if not check_admin(): return redirect(url_for('pos.pos'))
    
    confirmacion = request.form.get('confirmacion')
    if confirmacion != 'BORRAR TODO':
        flash('⚠️ Debes escribir "BORRAR TODO" para confirmar la limpieza.', 'warning')
        return redirect(url_for('mantenimiento.index'))
        
    try:
        # 1. Respaldo automático antes de borrar (DISPOSITIVO DE SEGURIDAD)
        now = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        dest = os.path.join(BACKUP_DIR, f"AUTO_RESPALDO_ANTES_DE_LIMPIAR_{now}.db")
        shutil.copy2(DB_PATH, dest)
        
        # 2. Limpiar base de datos (drop and create)
        db.drop_all()
        db.create_all()
        
        flash(f'🔥 Base de datos limpiada por completo. Se guardó un respaldo automático en {dest}', 'info')
    except Exception as e:
        flash(f'❌ Error al limpiar base de datos: {str(e)}', 'danger')
        
    return redirect(url_for('mantenimiento.index'))
