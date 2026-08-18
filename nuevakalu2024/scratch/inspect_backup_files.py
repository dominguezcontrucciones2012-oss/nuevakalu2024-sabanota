import os
import datetime

backup_dir = "backups"
files = [os.path.join(backup_dir, f) for f in os.listdir(backup_dir) if f.endswith(".db")]
files.sort(key=os.path.getmtime, reverse=True)

print(f"{'Filename':50s} | {'Size (KB)':10s} | {'Modified Time':19s}")
print("-" * 85)
for f in files:
    mtime = os.path.getmtime(f)
    dt = datetime.datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M:%S')
    size = os.path.getsize(f) / 1024.0
    print(f"{os.path.basename(f):50s} | {size:10.2f} | {dt:19s}")
