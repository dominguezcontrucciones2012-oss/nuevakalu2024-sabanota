import subprocess

try:
    res = subprocess.run(["docker", "logs", "--tail", "500", "kalu_app"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    lines = res.stderr.splitlines() + res.stdout.splitlines()
    print(f"Total lines in tail 500: {len(lines)}")
    
    print("\n=== All lines containing '22/May/2026' in tail ===")
    for line in lines:
        if "22/May/2026" in line:
            print(line)
except Exception as e:
    print("Error:", e)
