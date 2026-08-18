import requests
import json

BASE_URL = "https://firestore.googleapis.com/v1/projects/sistemekalu/databases/(default)/documents"

def delete_collection(collection_id):
    print(f"Limpiando coleccion: {collection_id}...")
    url = f"{BASE_URL}/{collection_id}?pageSize=300"
    
    while True:
        resp = requests.get(url)
        if resp.status_code != 200:
            print("Error:", resp.text)
            break
            
        data = resp.json()
        docs = data.get('documents', [])
        
        if not docs:
            break
            
        for d in docs:
            doc_name = d['name']
            del_resp = requests.delete(f"https://firestore.googleapis.com/v1/{doc_name}")
            if del_resp.status_code == 200:
                print(f"Borrado: {doc_name.split('/')[-1]}")
            else:
                print(f"Error borrando {doc_name}: {del_resp.status_code}")
                
        next_page = data.get('nextPageToken')
        if not next_page:
            break
        url = f"{BASE_URL}/{collection_id}?pageSize=300&pageToken={next_page}"

def reset_suppliers():
    print("Reseteando proveedores...")
    url = f"{BASE_URL}/suppliers?pageSize=300"
    resp = requests.get(url).json()
    for d in resp.get('documents', []):
        doc_name = d['name']
        fields = d.get('fields', {})
        fields['balanceOwed'] = {"integerValue": "0"}
        fields['storeDebt'] = {"integerValue": "0"}
        
        patch_resp = requests.patch(f"https://firestore.googleapis.com/v1/{doc_name}?updateMask.fieldPaths=balanceOwed&updateMask.fieldPaths=storeDebt", json={"fields": fields})
        print(f"Proveedor reseteado: {doc_name.split('/')[-1]} - {patch_resp.status_code}")

def reset_clients():
    print("Reseteando clientes...")
    url = f"{BASE_URL}/clients?pageSize=300"
    resp = requests.get(url).json()
    for d in resp.get('documents', []):
        doc_name = d['name']
        fields = d.get('fields', {})
        fields['outstandingDebt'] = {"integerValue": "0"}
        fields['loyaltyPoints'] = {"integerValue": "0"}
        
        patch_resp = requests.patch(f"https://firestore.googleapis.com/v1/{doc_name}?updateMask.fieldPaths=outstandingDebt&updateMask.fieldPaths=loyaltyPoints", json={"fields": fields})
        print(f"Cliente reseteado: {doc_name.split('/')[-1]} - {patch_resp.status_code}")

if __name__ == '__main__':
    delete_collection("transactions")
    reset_suppliers()
    reset_clients()
    print("¡TODO LIMPIO!")
