import json

log_path = r"C:\Users\Kalu\.gemini\antigravity\brain\eba762a1-33f5-4a84-8857-1faaff59f5be\.system_generated\logs\transcript.jsonl"
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('type') == 'USER_INPUT' or data.get('source') == 'USER_EXPLICIT':
                print(f"[USER]: {data.get('content')}")
            elif data.get('type') == 'PLANNER_RESPONSE' or data.get('type') == 'MODEL_RESPONSE':
                # show model response summary or first 100 chars
                print(f"[MODEL]: {data.get('content')[:120]}...")
        except Exception as e:
            pass
