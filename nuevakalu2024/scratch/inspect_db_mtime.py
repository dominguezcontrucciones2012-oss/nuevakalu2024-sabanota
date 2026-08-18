import os
import datetime

def print_mtime(path):
    if os.path.exists(path):
        mtime = os.path.getmtime(path)
        dt = datetime.datetime.fromtimestamp(mtime)
        print(f"Path: {path} | ModTime: {dt} | Size: {os.path.getsize(path)}")
    else:
        print(f"Path: {path} | Does not exist")

print_mtime("instance/kalu_master.db")
print_mtime("backups/respaldo_kalu_2026-05-20_02-58-16.db")
print_mtime("backups/respaldo_kalu_2026-05-19_01-11-31.db")
