import json

log_path = r"C:\Users\Kalu\.gemini\antigravity\brain\eba762a1-33f5-4a84-8857-1faaff59f5be\.system_generated\logs\transcript.jsonl"
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        data = json.loads(line)
        tool_calls = data.get('tool_calls')
        if tool_calls:
            print(f"Step {data.get('step_index')} | Type: {data.get('type')}")
            for tc in tool_calls:
                # print name and arguments keys
                name = tc.get('name')
                args = tc.get('arguments', tc.get('args', {}))
                # print args keys only or summary
                print(f"  Tool name: {name} | Args keys: {list(args.keys()) if isinstance(args, dict) else type(args)}")
                if name == 'run_command':
                    print(f"    CommandLine: {args.get('CommandLine')}")
                elif name in ['write_to_file', 'replace_file_content', 'multi_replace_file_content']:
                    print(f"    TargetFile: {args.get('TargetFile')}")
