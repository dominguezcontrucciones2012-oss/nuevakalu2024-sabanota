import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from routes.ia_inventario import detectar_anomalias_locales, buscar_duplicados_locales

print("=== INICIANDO PRUEBA DE AUDITORÍA DE INVENTARIO LOCAL ===")

with app.app_context():
    # 1. Ejecutar detector de anomalías
    print("\n[+] Detectando anomalías locales...")
    anomalias = detectar_anomalias_locales()
    print(f"Total anomalías locales detectadas: {len(anomalias)}")
    
    # Mostrar las primeras 5 anomalías
    for item in anomalias[:5]:
        print(f"  - Cod: {item['codigo']} | Nombre: {item['nombre']} | Cat: {item['categoria']} | Alerta: {item['razones']}")
        print(f"    Sugerido -> Nombre: {item['sugerencia_nombre']} | Cat: {item['sugerencia_cat']} | Precio: ${item['sugerencia_precio']}")

    # 2. Ejecutar detector de duplicados
    print("\n[+] Detectando duplicados por similitud de nombres...")
    duplicados = buscar_duplicados_locales()
    print(f"Total duplicados detectados: {len(duplicados)}")
    
    # Mostrar las primeras 5 parejas
    for dup in duplicados[:5]:
        print(f"  - Coincidencia ({dup['ratio']}%):")
        print(f"    1) {dup['p1']['nombre']} ({dup['p1']['codigo']})")
        print(f"    2) {dup['p2']['nombre']} ({dup['p2']['codigo']})")

print("\n=== PRUEBA COMPLETADA EXITOSAMENTE ===")
