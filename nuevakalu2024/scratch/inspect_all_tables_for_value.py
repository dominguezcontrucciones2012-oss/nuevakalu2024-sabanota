import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import db

with app.app_context():
    print("BUSCANDO EL VALOR 124.50 EN TODAS LAS TABLAS DE LA BASE DE DATOS...")
    print("=" * 80)
    
    # Obtener todas las tablas
    inspector = db.inspect(db.engine)
    table_names = inspector.get_table_names()
    
    for t_name in table_names:
        # Obtener columnas
        columns = [c['name'] for c in inspector.get_columns(t_name)]
        
        # Construir una consulta SQL dinamica para buscar en todas las columnas
        # que coincidan con 124.50 o 124.5
        conditions = []
        for col in columns:
            conditions.append(f"CAST({col} AS TEXT) LIKE '%124.5%'")
            
        sql = f"SELECT * FROM {t_name} WHERE " + " OR ".join(conditions)
        
        try:
            res = db.session.execute(db.text(sql)).fetchall()
            if res:
                print(f"Tabla: {t_name} | Coincidencias encontradas ({len(res)}):")
                for row in res:
                    print(f"  - {dict(row._mapping)}")
        except Exception as e:
            # Algunas tablas pueden fallar por tipos de datos especificos o estar vacias
            pass
            
    print("Busqueda completada.")
