from app import app
from models import db, User, Proveedor

with app.app_context():
    for username in ['28241058', '31107381']:
        u = User.query.filter_by(username=username).first()
        if u:
            print(f"User: {u.username} | Name: {u.nombre_completo} | Role: {u.role} | Prov ID: {u.proveedor_id}")
            if u.proveedor_id:
                p = Proveedor.query.get(u.proveedor_id)
                if p:
                    print(f"  Proveedor: {p.nombre} | es_productor: {p.es_productor} | es_obrero: {p.es_obrero}")
                else:
                    print("  Linked proveedor not found in DB")
            else:
                print("  No provider linked to user")
        else:
            print(f"User {username} not found")
