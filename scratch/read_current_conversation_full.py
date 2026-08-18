import json

log_path = r"C:\Users\Kalu\.gemini\antigravity\brain\fe1fda82-cc41-40b7-a8b6-677550b5f6bb\.system_generated\logs\transcript.jsonl"
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            mtype = data.get('type')
            source = data.get('source')
            # If it is a user input or a significant tool call/response
            if mtype == 'USER_INPUT' or source == 'USER_EXPLICIT':
                print(f"[USER STEP {data.get('step_index')}]: {data.get('content')}")
            elif mtype == 'PLANNER_RESPONSE' and data.get('content') and data.get('content') != 'None':
                print(f"[MODEL STEP {data.get('step_index')}]: {data.get('content')[:150]}...")
            elif mtype == 'RUN_COMMAND':
                tool_calls = data.get('tool_calls', [])
                for tc in tool_calls:
                    cmd = tc.get('arguments', {}).get('CommandLine')
                    print(f"  [RUN COMMAND STEP {data.get('step_index')}]: {cmd}")
        except Exception as e:
            pass
