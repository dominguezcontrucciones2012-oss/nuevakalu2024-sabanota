import os

for root, dirs, files in os.walk('.'):
    # skip .venv and .git
    if '.venv' in root or '.git' in root:
        continue
    for file in files:
        if file.endswith('.db') or file.endswith('.sqlite') or file.endswith('.sqlite3'):
            path = os.path.join(root, file)
            print(f"Path: {path} | Size: {os.path.getsize(path)} bytes")
