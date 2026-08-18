with open("scratch/all_docker_logs.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
print("Últimas 50 líneas del archivo de logs:")
for line in lines[-50:]:
    print(line.strip())
