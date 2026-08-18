import subprocess
from collections import Counter

try:
    res = subprocess.run(["docker", "logs", "kalu_app"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    lines = res.stderr.splitlines() + res.stdout.splitlines()
    print(f"Total log lines: {len(lines)}")
    
    hours = []
    for line in lines:
        if "22/May/2026" in line:
            # Extract hour, e.g. "22/May/2026:15"
            parts = line.split("22/May/2026:")
            if len(parts) > 1:
                hour = parts[1][:2]
                hours.append(hour)
                
    counts = Counter(hours)
    print("Logs per hour for May 22, 2026:")
    for h in sorted(counts.keys()):
        print(f"  {h}:00 - {h}:59 UTC : {counts[h]} lines")
        
    print("\n=== Sample lines from today ===")
    sample_count = 0
    for line in lines:
        if "22/May/2026" in line:
            print(line)
            sample_count += 1
            if sample_count >= 10:
                break
except Exception as e:
    print("Error:", e)
