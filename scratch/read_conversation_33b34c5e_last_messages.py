import json

log_path = r"C:\Users\Kalu\.gemini\antigravity\brain\33b34c5e-6fe2-403b-8012-2f7c6b6c4d03\.system_generated\logs\transcript.jsonl"
with open(log_path, 'r', encoding='utf-8') as f:
    messages = []
    for line in f:
        try:
            data = json.loads(line)
            mtype = data.get('type')
            source = data.get('source')
            if mtype in ['USER_INPUT', 'PLANNER_RESPONSE', 'MODEL_RESPONSE', 'MODEL'] or source == 'USER_EXPLICIT':
                messages.append((mtype, source, data.get('content')))
        except Exception as e:
            pass
            
    print(f"Total messages of interest: {len(messages)}")
    for mtype, source, content in messages[-10:]:
        print(f"\n[{mtype} / {source}]:\n{content}")
