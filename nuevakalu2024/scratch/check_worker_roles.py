from app import app
from models import db, User

def check_roles():
    with app.app_context():
        # Diana: 28241058, Andres: 31107381
        usernames = ['28241058', '31107381']
        for uname in usernames:
            u = User.query.filter_by(username=uname).first()
            if u:
                print(f"User: {u.username} | Name: {u.nombre_completo} | Role: {u.role}")
            else:
                print(f"User {uname} NOT FOUND")

if __name__ == "__main__":
    check_roles()
