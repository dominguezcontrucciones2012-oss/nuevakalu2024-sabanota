print("Analizando scratch/recent_logs.txt...")
with open("scratch/recent_logs.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

out = []
for line in lines:
    if any(term in line.lower() for term in ["cierre", "ejecutar_cierre", "28241058"]):
        out.append(line.strip())

with open("scratch/recent_cierre_requests.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out))

print(f"Búsqueda finalizada. Encontradas {len(out)} líneas. Escrito en scratch/recent_cierre_requests.txt")
