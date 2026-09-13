import subprocess
import os

key_path = r'C:\Users\Kalu\.ssh\id_rsa_kalu'
remote_path = 'ubuntu@35.225.140.79:~/nuevakalu2024/instance/kalu_master.db'
local_path = r'D:\nuevakalu2024\instance\kalu_master.db'

print("Attempting sync via subprocess scp...")
cmd = f'scp -i {key_path} -o StrictHostKeyChecking=no {remote_path} {local_path}'
try:
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode == 0:
        print("Success!")
    else:
        print(f"Failed: {result.stderr}")
except Exception as e:
    print(f"Error: {e}")
