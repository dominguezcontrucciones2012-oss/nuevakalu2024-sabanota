import json

log_path = r"C:\Users\Kalu\.gemini\antigravity\brain\33b34c5e-6fe2-403b-8012-2f7c6b6c4d03\.system_generated\logs\transcript.jsonl"
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        data = json.loads(line)
        content = data.get('content')
        if data.get('source') == 'MODEL' and data.get('type') == 'PLANNER_RESPONSE' and content and content != 'None':
            print(f"--- STEP {data.get('step_index')} ---")
            print(content)
