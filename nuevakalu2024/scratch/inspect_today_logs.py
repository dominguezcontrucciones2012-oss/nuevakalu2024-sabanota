import subprocess

try:
    res = subprocess.run(["docker", "logs", "kalu_app"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    lines = res.stderr.splitlines() + res.stdout.splitlines()
    print(f"Total lines: {len(lines)}")
    
    print("\n=== Log lines from 22/May/2026 21:00 to 22:30 UTC ===")
    count = 0
    for line in lines:
        if "22/May/2026:21:" in line or "22/May/2026:22:" in line:
            print(line)
            count += 1
    print(f"Printed {count} lines.")
except Exception as e:
    print("Error:", e)
