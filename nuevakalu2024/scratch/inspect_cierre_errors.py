import subprocess

def get_errors():
    try:
        res = subprocess.run(["docker", "logs", "kalu_app"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
        lines = res.stderr.splitlines() + res.stdout.splitlines()
        print(f"Total lines: {len(lines)}")
        
        in_traceback = False
        tb_lines = []
        for line in lines:
            if "Traceback (" in line or "ERROR:KALU:" in line or "sqlite3.DatabaseError:" in line or "sqlalchemy.exc." in line:
                in_traceback = True
                tb_lines.append(line)
            elif in_traceback:
                if line.startswith("  ") or line.startswith("Traceback") or "Error" in line:
                    tb_lines.append(line)
                else:
                    tb_lines.append(line)
                    in_traceback = False
                    tb_lines.append("-" * 80)
                    
        print(f"--- Tracebacks found: {len(tb_lines)} lines ---")
        # Print the last 150 lines of tracebacks
        for line in tb_lines[-150:]:
            print(line)
    except Exception as e:
        print("Error:", e)

if __name__ == '__main__':
    get_errors()
