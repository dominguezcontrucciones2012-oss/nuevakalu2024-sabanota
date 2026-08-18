import subprocess

key_path = r'C:\Users\Kalu\.ssh\id_rsa_kalu'
remote_host = 'ubuntu@35.225.140.79'

# Test listing directory on remote host
cmd = f'ssh -i "{key_path}" -o StrictHostKeyChecking=no {remote_host} "ls -la"'
print(f"Running: {cmd}")
try:
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print("Return code:", result.returncode)
    print("Stdout:\n", result.stdout)
    print("Stderr:\n", result.stderr)
except Exception as e:
    print(f"Error: {e}")
