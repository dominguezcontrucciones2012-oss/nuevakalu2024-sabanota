import subprocess

try:
    res = subprocess.run(["docker", "logs", "kalu_app"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    lines = res.stderr.splitlines() + res.stdout.splitlines()
    print(f"Total lines: {len(lines)}")
    
    # filter lines containing keywords
    keywords = ["entrega", "queso", "tonco", "eliminar", "productor", "andres", "30", "19", "5"]
    matched = []
    for line in lines:
        if any(kw in line.lower() for kw in keywords):
            matched.append(line)
            
    print(f"Matched lines: {len(matched)}")
    for m in matched[-100:]:
        print(m)
except Exception as e:
    print("Error:", e)
