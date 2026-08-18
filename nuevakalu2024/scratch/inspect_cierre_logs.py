import subprocess

try:
    res = subprocess.run(["docker", "logs", "kalu_app"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    lines = res.stderr.splitlines() + res.stdout.splitlines()
    print(f"Total lines: {len(lines)}")
    
    print("\n=== Log lines containing 'cierre' ===")
    for line in lines:
        if "cierre" in line.lower() or "caja" in line.lower():
            print(line)
except Exception as e:
    print("Error:", e)
