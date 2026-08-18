import subprocess

try:
    res = subprocess.run(["docker", "logs", "kalu_app"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    lines = res.stderr.splitlines() + res.stdout.splitlines()
    print(f"Total lines: {len(lines)}")
    
    # We want to print any log lines containing "registrar_entrega" or "eliminar" or "tonco" or "5" or "30" or "19"
    # and also let's look at POST requests in general on May 19/20
    print("\n=== POST requests and producer logs on May 19/20 ===")
    for line in lines:
        if "19/May/2026" in line or "20/May/2026" in line:
            if "POST" in line or "entrega" in line.lower() or "tonco" in line.lower() or "eliminar" in line.lower():
                print(line)
except Exception as e:
    print("Error:", e)
