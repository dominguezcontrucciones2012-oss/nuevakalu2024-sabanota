import subprocess

try:
    res = subprocess.run(["docker", "logs", "kalu_app"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    lines = res.stderr.splitlines() + res.stdout.splitlines()
    print(f"Total lines: {len(lines)}")
    
    print("\n=== Log lines with '/ejecutar_cierre' ===")
    for line in lines:
        if "ejecutar_cierre" in line:
            print(line)
except Exception as e:
    print("Error:", e)
