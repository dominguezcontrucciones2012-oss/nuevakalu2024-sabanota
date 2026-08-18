import json

log_path = r"C:\Users\Kalu\.gemini\antigravity\brain\33b34c5e-6fe2-403b-8012-2f7c6b6c4d03\.system_generated\logs\transcript.jsonl"
with open(log_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()
    print(f"Total lines: {len(lines)}")
    # Print the last 10 lines, with select fields
    for line in lines[-15:]:
        data = json.loads(line)
        print(f"Index: {data.get('step_index')} | Source: {data.get('source')} | Type: {data.get('type')} | Content: {str(data.get('content'))[:100]}")
conn = None
