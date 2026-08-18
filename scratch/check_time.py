import sys
import os
from datetime import datetime
import pytz

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from models import ahora_ve, hoy_ve

print(f"Python datetime.now(): {datetime.now()}")
print(f"Python datetime.utcnow(): {datetime.utcnow() if hasattr(datetime, 'utcnow') else 'N/A'}")
print(f"ahora_ve(): {ahora_ve()}")
print(f"hoy_ve(): {hoy_ve()}")
print(f"Caracas timezone now: {datetime.now(pytz.timezone('America/Caracas'))}")
