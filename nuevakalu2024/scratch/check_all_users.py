from app import app
from models import db, User

def list_users():
    with app.app_context():
        users = User.query.all()
        print(f"{'Username':<20} | {'Email':<30} | {'Role':<10} | {'Google ID':<30}")
        print("-" * 100)
        for u in users:
            print(f"{u.username:<20} | {str(u.email):<30} | {str(u.role):<10} | {str(u.google_id):<30}")

if __name__ == "__main__":
    list_users()
