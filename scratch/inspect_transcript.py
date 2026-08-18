import json
import os

transcript_path = r"C:\Users\Kalu\.gemini\antigravity\brain\fe1fda82-cc41-40b7-a8b6-677550b5f6bb\.system_generated\logs\transcript.jsonl"

if not os.path.exists(transcript_path):
    print("Transcript not found at", transcript_path)
else:
    with open(transcript_path, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f):
            try:
                data = json.loads(line)
                # print user inputs and some model responses
                step_idx = data.get("step_index")
                source = data.get("source")
                type_ = data.get("type")
                content = data.get("content", "")
                tool_calls = data.get("tool_calls", [])
                
                if source == "USER_EXPLICIT" or type_ == "USER_INPUT":
                    print(f"\n[Step {step_idx}] USER: {content}")
                elif source == "MODEL" and ("andres" in str(content).lower() or "tonco" in str(content).lower() or "queso" in str(content).lower()):
                    # check if model did something
                    print(f"[Step {step_idx}] MODEL (partial): {content[:300]}...")
                
                # Check tool calls
                if tool_calls:
                    for tc in tool_calls:
                        tc_str = str(tc)
                        if "andres" in tc_str.lower() or "tonco" in tc_str.lower() or "queso" in tc_str.lower():
                            print(f"  Tool Call: {tc.get('name')} | args: {tc.get('arguments')}")
            except Exception as e:
                print(f"Error parsing line {i}: {e}")
