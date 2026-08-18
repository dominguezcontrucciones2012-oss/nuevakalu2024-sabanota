import subprocess

try:
    print("Obteniendo últimas 500 líneas de logs...")
    result = subprocess.run(["docker", "logs", "--tail", "500", "kalu_app"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    logs = result.stdout + "\n" + result.stderr
    
    with open("scratch/recent_logs.txt", "w", encoding="utf-8") as f:
        f.write(logs)
        
    print("Completado. Escrito en scratch/recent_logs.txt")
except Exception as e:
    print(f"Error: {e}")
