import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app

print("=== CHECKING APP ROUTES ===")
for rule in app.url_map.iter_rules():
    if "ia-inventario" in str(rule) or "ia_inventario" in str(rule):
        print(f"Match: {rule.endpoint} -> {rule.rule} (methods: {rule.methods})")
print("=== END OF CHECK ===")
