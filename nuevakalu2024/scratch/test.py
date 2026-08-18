from app import app, db
from models import User
import unittest

app.config['TESTING'] = True
app.config['WTF_CSRF_ENABLED'] = False
client = app.test_client()

with app.app_context():
    admin = User.query.filter(User.role.in_(['admin', 'supervisor', 'dueno'])).first()
    print("Admin found:", admin.username if admin else "None")
    
    with client.session_transaction() as sess:
        sess['_user_id'] = str(admin.id)
        sess['_fresh'] = True
        
    response = client.post('/api/verify_pin', data="not a json", content_type='application/json')
    print("Status code:", response.status_code)
    print("Location:", response.headers.get('Location'))
