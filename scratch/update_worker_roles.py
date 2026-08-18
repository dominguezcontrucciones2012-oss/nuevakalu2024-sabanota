from app import app
from models import db, User

def update_to_cajero():
    with app.app_context():
        usernames = ['28241058', '31107381']
        for uname in usernames:
            u = User.query.filter_by(username=uname).first()
            if u:
                u.role = 'cajero'
                print(f"User {u.username} ({u.nombre_completo}) role updated to: {u.role}")
            else:
                print(f"User {uname} NOT FOUND")
        db.session.commit()

if __name__ == "__main__":
    update_to_cajero()
