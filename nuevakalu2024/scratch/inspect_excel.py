import os
import pandas as pd

import_dir = r"d:\nuevakalu2024\importar_aqui"
files = ["Listado_de_Proveedores2802.xlsx", "PROVEEDORES_VIERNES.xlsx", "plantilla_proveedores_1.xlsx"]

for f in files:
    path = os.path.join(import_dir, f)
    if os.path.exists(path):
        print(f"\n==========================================")
        print(f"ARCHIVO EXCEL: {f}")
        print(f"==========================================")
        try:
            df = pd.read_excel(path)
            # Normalizar nombres de columnas
            df.columns = [c.strip().lower() for c in df.columns]
            print("Columnas:", list(df.columns))
            
            # Buscar filas relacionadas con Marcos Corro o Angelito
            for idx, row in df.iterrows():
                nombre = str(row.get('nombre', '')).lower()
                if 'marcos' in nombre or 'angelito' in nombre or 'corro' in nombre:
                    row_dict = {k: row[k] for k in df.columns}
                    print(f"  - Row {idx}: {row_dict}")
                    
        except Exception as e:
            print(f"Error: {e}")
