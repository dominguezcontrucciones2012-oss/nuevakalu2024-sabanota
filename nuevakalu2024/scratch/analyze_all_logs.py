from collections import Counter

print("Analizando scratch/all_docker_logs.txt...")
with open("scratch/all_docker_logs.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

hours = Counter()
for line in lines:
    # Look for patterns like [22/May/2026:22:15:30 +0000]
    import re
    m = re.search(r'\[(\d{2}/[A-Za-z]+/\d{4}):(\d{2}):\d{2}:\d{2}', line)
    if m:
        date_str, hour_str = m.groups()
        hours[f"{date_str} {hour_str}:00 UTC"] += 1

print("Distribución de solicitudes por hora:")
for key in sorted(hours.keys()):
    print(f"  {key} -> {hours[key]} solicitudes")
