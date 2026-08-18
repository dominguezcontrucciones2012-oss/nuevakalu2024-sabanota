with open("test_ia.log", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
print("Primeras 20 líneas:")
for line in lines[:20]:
    print(line.strip())

print("\nÚltimas 20 líneas:")
for line in lines[-20:]:
    print(line.strip())
