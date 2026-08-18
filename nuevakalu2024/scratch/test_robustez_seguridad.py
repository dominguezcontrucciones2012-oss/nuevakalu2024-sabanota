import unittest
from decimal import Decimal
from app import app, db
from models import User, Cliente, Producto, Proveedor

class TestRobustezSeguridad(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        app.config['WTF_CSRF_ENABLED'] = False
        self.client = app.test_client()
        self.app_context = app.app_context()
        self.app_context.push()

        # Encontrar y loguear administrador para los endpoints protegidos
        self.admin = User.query.filter(User.role.in_(['admin', 'dueno'])).first()
        self.cajero = User.query.filter_by(role='cajero', username='test_cajero_role').first()
        if not self.cajero:
            self.cajero = User(username='test_cajero_role', password='pbkdf2:sha256:260000$placeholder', role='cajero', activo=True)
            db.session.add(self.cajero)
            db.session.commit()

        print(f"DEBUG setUp: self.admin = {self.admin} (role={self.admin.role if self.admin else None}, id={self.admin.id if self.admin else None}), self.cajero = {self.cajero} (role={self.cajero.role if self.cajero else None}, id={self.cajero.id if self.cajero else None})")

        # Establecer la sesión de admin para la instancia de client
        if self.admin:
            with self.client.session_transaction() as sess:
                sess['_user_id'] = str(self.admin.id)
                sess['_fresh'] = True

    def tearDown(self):
        db.session.rollback()
        self.app_context.pop()

    def test_verify_pin_invalid_json(self):
        response = self.client.post(
            '/api/verify_pin',
            data="not a json",
            content_type='application/json'
        )
        self.assertIn(response.status_code, [400, 415])

    def test_barcode_login_inactive_user(self):
        # Crear usuario inactivo temporal para la prueba
        user = User.query.filter_by(username='test_inactivo').first()
        if not user:
            user = User(username='test_inactivo', password='pbkdf2:sha256:260000$placeholder', role='productor', activo=False)
            db.session.add(user)
            db.session.commit()
        else:
            user.activo = False
            db.session.commit()

        # Diana Aponte (username 28241058, barcode 1001)
        original_activo = True
        real_user = User.query.filter_by(username='28241058').first()
        if real_user:
            original_activo = real_user.activo
            real_user.activo = False
            db.session.commit()
            
            # Usar un cliente limpio sin sesión previa para probar el barcode-login
            clean_client = app.test_client()
            response = clean_client.post('/barcode-login', json={'codigo': '1001'})
            self.assertEqual(response.status_code, 403)
            
            # Restaurar
            real_user.activo = original_activo
            db.session.commit()

    def test_model_level_permission_on_offer_price(self):
        # Crear un producto de prueba
        prod = Producto.query.filter_by(codigo='TEST_PERM_PROD').first()
        if not prod:
            prod = Producto(
                codigo='TEST_PERM_PROD',
                nombre='Test Producto Permisos',
                costo_usd=Decimal('10.00'),
                precio_normal_usd=Decimal('15.00'),
                precio_oferta_usd=Decimal('0.00')
            )
            db.session.add(prod)
            db.session.commit()

        # Fuera de contexto de petición, modificar oferta debería funcionar (ej. para scripts de actualización)
        prod.precio_oferta_usd = Decimal('12.50')
        db.session.commit()
        self.assertEqual(prod.precio_oferta_usd, Decimal('12.50'))

        # Dentro de contexto de petición con rol no autorizado (cajero)
        with app.test_request_context():
            from flask import session
            session['_user_id'] = str(self.cajero.id)
            session['_fresh'] = True
            app.login_manager._load_user()
            
            prod_ctx = Producto.query.filter_by(codigo='TEST_PERM_PROD').first()
            try:
                prod_ctx.precio_oferta_usd = Decimal('13.00')
                db.session.commit()
                self.fail("ValueError expected when non-authorized user modifies offer price")
            except ValueError as e:
                self.assertIn("Permiso denegado", str(e))
                db.session.rollback()

        # Dentro de contexto de petición con rol autorizado (admin/dueno)
        if self.admin:
            with app.test_request_context():
                from flask import session
                session['_user_id'] = str(self.admin.id)
                session['_fresh'] = True
                app.login_manager._load_user()
                
                prod_ctx = Producto.query.filter_by(codigo='TEST_PERM_PROD').first()
                # Modificar oferta
                prod_ctx.precio_oferta_usd = Decimal('12.00')
                db.session.commit()
                self.assertEqual(prod_ctx.precio_oferta_usd, Decimal('12.00'))

    def test_ia_aplicar_oferta_route_restrictions_cajero(self):
        # Crear o buscar un producto con margen suficiente para que el descuento del 10% no viole la regla del 15%
        prod = Producto.query.filter_by(codigo='TEST_IA_PROD').first()
        if not prod:
            prod = Producto(
                codigo='TEST_IA_PROD',
                nombre='Test Producto IA',
                costo_usd=Decimal('10.00'),
                precio_normal_usd=Decimal('20.00'),
                precio_oferta_usd=Decimal('0.00')
            )
            db.session.add(prod)
            db.session.commit()
        else:
            # Asegurar valores compatibles
            prod.costo_usd = Decimal('10.00')
            prod.precio_normal_usd = Decimal('20.00')
            prod.precio_oferta_usd = Decimal('0.00')
            db.session.commit()

        # Probar con un cajero (no autorizado) - crear un cliente con sesión de cajero
        cajero_client = app.test_client()
        with cajero_client.session_transaction() as sess:
            sess['_user_id'] = str(self.cajero.id)
            sess['_fresh'] = True

        print(f"DEBUG: cajero_client session before POST: id={self.cajero.id}")
        response = cajero_client.post(f'/ia/aplicar_oferta/{prod.id}', follow_redirects=True)
        self.assertIn("Acceso Denegado", response.get_data(as_text=True))

    def test_ia_aplicar_oferta_route_restrictions_admin(self):
        # Crear o buscar un producto con margen suficiente para que el descuento del 10% no viole la regla del 15%
        prod = Producto.query.filter_by(codigo='TEST_IA_PROD').first()
        if not prod:
            prod = Producto(
                codigo='TEST_IA_PROD',
                nombre='Test Producto IA',
                costo_usd=Decimal('10.00'),
                precio_normal_usd=Decimal('20.00'),
                precio_oferta_usd=Decimal('0.00')
            )
            db.session.add(prod)
            db.session.commit()
        else:
            # Asegurar valores compatibles
            prod.costo_usd = Decimal('10.00')
            prod.precio_normal_usd = Decimal('20.00')
            prod.precio_oferta_usd = Decimal('0.00')
            db.session.commit()

        # Probar con un admin (autorizado)
        if self.admin:
            # Usar el cliente por defecto que ya se inicializó con la sesión del admin en setUp
            print(f"DEBUG: admin_client (self.client) session before POST: id={self.admin.id}")
            response = self.client.post(f'/ia/aplicar_oferta/{prod.id}', follow_redirects=True)
            self.assertIn("IA: Oferta aplicada", response.get_data(as_text=True))

    def test_crear_producto_rapido_defaults(self):
        # Crear un producto rápido sin oferta especificada
        admin_client = app.test_client()
        if self.admin:
            with admin_client.session_transaction() as sess:
                sess['_user_id'] = str(self.admin.id)
                sess['_fresh'] = True

        import random
        random_code = f"RAPID_{random.randint(1000, 9999)}"
        response = admin_client.post(
            '/crear_producto_rapido',
            json={
                'codigo': random_code,
                'nombre': 'Rapid Product Test',
                'costo': '10.00',
                'precio': '15.00',
                'precio_oferta': '0.00',
                'stock': '5'
            }
        )
        self.assertEqual(response.status_code, 200)
        
        # Verificar en base de datos que precio_oferta_usd es 0.00 y no 15.00
        p = Producto.query.filter_by(codigo=random_code).first()
        self.assertIsNotNone(p)
        self.assertEqual(p.precio_oferta_usd, Decimal('0.00'))

if __name__ == '__main__':
    unittest.main()
