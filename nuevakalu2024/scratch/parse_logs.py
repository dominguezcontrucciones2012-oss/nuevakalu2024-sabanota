import subprocess

try:
    print("Obteniendo logs completos de docker...")
    result = subprocess.run(["docker", "logs", "kalu_app"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    logs = result.stdout + "\n" + result.stderr
    
    with open("scratch/all_docker_logs.txt", "w", encoding="utf-8") as f:
        f.write(logs)
        
    lines = logs.split("\n")
    print(f"Búsqueda finalizada. Se escribieron {len(lines)} líneas en scratch/all_docker_logs.txt")
except Exception as e:
    print(f"Error al obtener logs: {e}")
