import json

log_path = r"C:\Users\Kalu\.gemini\antigravity\brain\33b34c5e-6fe2-403b-8012-2f7c6b6c4d03\.system_generated\logs\transcript.jsonl"
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('type') == 'USER_INPUT' or data.get('source') == 'USER_EXPLICIT':
                print(f"[USER]: {data.get('content')}")
            elif data.get('type') == 'PLANNER_RESPONSE' or data.get('type') == 'MODEL_RESPONSE':
                print(f"[MODEL]: {data.get('content')[:120]}...")
        except Exception as e:
            pass
