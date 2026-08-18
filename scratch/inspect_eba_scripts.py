import json

log_path = r"C:\Users\Kalu\.gemini\antigravity\brain\eba762a1-33f5-4a84-8857-1faaff59f5be\.system_generated\logs\transcript.jsonl"
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        data = json.loads(line)
        mtype = data.get('type')
        if mtype in ['RUN_COMMAND', 'WRITE_FILE', 'REPLACE_FILE_CONTENT', 'MULTI_REPLACE_FILE_CONTENT']:
            tool_calls = data.get('tool_calls', [])
            for tc in tool_calls:
                func = tc.get('function', {})
                name = func.get('name')
                args = func.get('arguments', {})
                print(f"Step {data.get('step_index')} | Tool: {name} | Args: {args}")
