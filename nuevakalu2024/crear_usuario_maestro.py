from app import app
from models import db, User
from werkzeug.security import generate_password_hash

def crear_maestro():
    with app.app_context():
        master = User.query.filter_by(username='juancarlos').first()
        if not master:
            master = User(
                username='juancarlos',
                password=generate_password_hash('7788'),
                role='dueno',
                nombre_completo='Juan Carlos'
            )
            db.session.add(master)
            db.session.commit()
            print("Usuario 'juancarlos' creado con éxito.")
            print("Username: juancarlos")
            print("Password: 7788")
            print("Rol: dueno")
        else:
            master.password = generate_password_hash('7788')
            master.role = 'dueno'
            db.session.commit()
            print("El usuario 'juancarlos' ya existía. La contraseña ha sido restablecida.")
            print("Username: juancarlos")
            print("Password: 7788")
            print("Rol: dueno")

if __name__ == '__main__':
    crear_maestro()
