python -c "
import json
with open(r'C:\Users\domin\.gemini\antigravity-ide\brain\90ea4b2e-a496-4455-83ae-2d376b841af5\.system_generated\logs\transcript_full.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'def recover_file' in line:
            data = json.loads(line)
            for call in data.get('tool_calls', []):
                args = call.get('args', {})
                if 'CommandLine' in args and 'def recover_file' in args['CommandLine']:
                    with open('recover.py', 'w', encoding='utf-8') as out:
                        out.write(args['CommandLine'])
                        print('Wrote recover.py')
                    break
"