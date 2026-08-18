import os
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()

_key = os.environ.get('FERNET_KEY')
_cipher = Fernet(_key.encode()) if _key else None

def encrypt_data(text):
    if not text or not _cipher:
        return text
    try:
        # Si ya está encriptado (empieza por gAAAA), no lo hacemos de nuevo
        if text.startswith('gAAAA'):
            return text
        return _cipher.encrypt(text.encode()).decode()
    except:
        return text

def decrypt_data(token):
    if not token or not _cipher:
        return token
    try:
        # Solo intentamos desencriptar si parece un token de Fernet
        if not token.startswith('gAAAA'):
            return token
        return _cipher.decrypt(token.encode()).decode()
    except:
        return token
