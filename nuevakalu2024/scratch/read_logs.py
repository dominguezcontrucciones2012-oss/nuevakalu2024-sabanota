import json
import os

log_path = r"C:\Users\Kalu\.gemini\antigravity\brain\fe1fda82-cc41-40b7-a8b6-677550b5f6bb\.system_generated\logs\transcript.jsonl"
if os.path.exists(log_path):
    print("Found log file!")
    with open(log_path, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                data = json.loads(line)
                if data.get('type') == 'USER_INPUT' or data.get('source') == 'USER_EXPLICIT':
                    print(f"[{data.get('type')} / {data.get('source')}]: {data.get('content')}")
            except Exception as e:
                print("Error parsing line:", e)
else:
    print(f"Log file not found at {log_path}")
    # Let's list files in the directory to find the correct path
    dir_path = r"C:\Users\Kalu\.gemini\antigravity\brain\fe1fda82-cc41-40b7-a8b6-677550b5f6bb"
    if os.path.exists(dir_path):
        print(f"Contents of {dir_path}:")
        for root, dirs, files in os.walk(dir_path):
            for file in files:
                print(os.path.join(root, file))
