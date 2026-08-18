import subprocess

try:
    res = subprocess.run(["docker", "logs", "--tail", "150", "kalu_app"], capture_output=True, text=True, encoding="utf-8", errors="ignore")
    print(res.stdout)
    print(res.stderr)
except Exception as e:
    print("Error:", e)
