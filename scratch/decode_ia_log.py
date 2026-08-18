import os

log_path = "test_ia.log"
if not os.path.exists(log_path):
    print("El archivo no existe")
    exit()

# Try reading as UTF-16
print("Intentando leer como UTF-16...")
try:
    with open(log_path, "r", encoding="utf-16") as f:
        content = f.read()
    print("Leído exitosamente como UTF-16.")
except Exception as e:
    print(f"Error UTF-16: {e}")
    # Fallback to UTF-8
    print("Intentando como UTF-8...")
    with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

lines = content.split("\n")
print(f"Total de líneas descodificadas: {len(lines)}")

out_lines = []
for idx, line in enumerate(lines):
    if any(term in line.lower() for term in ["cierre", "ejecutar_cierre", "test_cierre", "test_cierre.py"]):
        out_lines.append(f"Línea {idx+1}: {line.strip()}")

with open("scratch/decoded_ia_log_cierre.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out_lines))

print(f"Búsqueda finalizada. Se encontraron {len(out_lines)} coincidencias.")
