import requests
import os

url = 'https://sistemakalu.com/static/respaldo_db.sqlite'
dest = r'D:\nuevakalu2024\instance\kalu_master.db'

print(f"Downloading from {url}...")
try:
    r = requests.get(url, timeout=30)
    if r.status_code == 200:
        with open(dest, 'wb') as f:
            f.write(r.content)
        print("Download successful!")
    else:
        print(f"Download failed with status code: {r.status_code}")
except Exception as e:
    print(f"Error: {e}")
