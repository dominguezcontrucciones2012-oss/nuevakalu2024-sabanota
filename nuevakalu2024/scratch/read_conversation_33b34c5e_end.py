import json

log_path = r"C:\Users\Kalu\.gemini\antigravity\brain\33b34c5e-6fe2-403b-8012-2f7c6b6c4d03\.system_generated\logs\transcript.jsonl"
with open(log_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()
    print(f"Total lines: {len(lines)}")
    # Print the last 15 lines
    for line in lines[-25:]:
        try:
            data = json.loads(line)
            if data.get('type') == 'USER_INPUT' or data.get('source') == 'USER_EXPLICIT':
                print(f"[USER]: {data.get('content')}")
            elif data.get('type') in ['PLANNER_RESPONSE', 'MODEL_RESPONSE', 'MODEL']:
                print(f"[MODEL]: {data.get('content')[:120]}...")
            else:
                print(f"[{data.get('type')} / {data.get('source')} / {data.get('status')}]: {data.get('tool_calls') or data.get('content')[:50]}")
        except Exception as e:
            pass
