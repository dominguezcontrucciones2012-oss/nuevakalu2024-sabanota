import re

print("Buscando solicitudes entre 22:00 y 22:15 UTC...")
with open("scratch/recent_logs.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

filtered = []
for line in lines:
    # Match time like [22/May/2026:22:00:00 to 22/May/2026:22:15:59
    m = re.search(r'\[22/May/2026:22:(\d{2}):\d{2}', line)
    if m:
        minute = int(m.group(1))
        if 0 <= minute <= 15:
            filtered.append(line.strip())

print(f"Encontradas {len(filtered)} solicitudes:")
for f_line in filtered:
    print(f_line)
