import os
import json

brain_dir = r"C:\Users\Kalu\.gemini\antigravity\brain"
print(f"Searching in {brain_dir}...")
if os.path.exists(brain_dir):
    for root, dirs, files in os.walk(brain_dir):
        for file in files:
            if file == 'transcript.jsonl':
                path = os.path.join(root, file)
                print(f"\nFound log: {path}")
                # Print the user inputs from this file
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        for line in f:
                            data = json.loads(line)
                            if data.get('type') == 'USER_INPUT' or data.get('source') == 'USER_EXPLICIT':
                                print(f"  - {data.get('content')[:120]}")
                except Exception as e:
                    print("  Error reading:", e)
else:
    print("Brain directory not found")
