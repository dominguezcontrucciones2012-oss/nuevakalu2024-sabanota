import os
import time

def get_file_info(path):
    try:
        stat = os.stat(path)
        mtime = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(stat.st_mtime))
        ctime = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(stat.st_ctime))
        return f"MTime: {mtime} | CTime: {ctime} | Size: {stat.st_size} bytes"
    except Exception as e:
        return str(e)

print("kalu_master.db:")
print(get_file_info("instance/kalu_master.db"))

print("\ncheck_cierre.py:")
print(get_file_info("scratch/check_cierre.py"))

print("\napp.py:")
print(get_file_info("app.py"))
