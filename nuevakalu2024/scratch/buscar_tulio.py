from app import app
from models import db, Cliente

def find_tulio():
    with app.app_context():
        # Buscamos por nombre o cedula
        clientes = Cliente.query.filter(
            (Cliente.nombre.ilike('%Tulio%')) | (Cliente.cedula.ilike('%Tulio%'))
        ).all()
        
        if not clientes:
            print("No se encontró ningún Tulio en la base de datos.")
            # Intentamos buscar por apellido
            clientes = Cliente.query.filter(Cliente.nombre.ilike('%Corro%')).all()
            if clientes:
                print("Se encontraron coincidencias por 'Corro':")
        
        for c in clientes:
            print(f"ID: {c.id} | Nombre: {c.nombre} | Cedula: {c.cedula} | Saldo USD: {c.saldo_usd}")

if __name__ == "__main__":
    find_tulio()
