# Snapshot del Proyecto: KALU CRM Oficial Sabanota

- **Fecha de Snapshot:** 2026-09-28
- **Estado:** Mismo código desplegado y verificado en producción al momento del cierre.
- **Producción:** https://sistemakalu.com
- **Portal Clientes/Productores:** https://sistemakalu.com/portal
- **Release Activo VPS:** `/root/kalu-crm-next`
- **Directorio de Datos Persistente VPS:** `/root/kalu-crm/data`

---

## 1. Conteo Canónico de Datos en Producción
- `clients_db.json`: **277**
- `suppliers_db.json`: **45**
- `products_db.json`: **628**
- `kardex_db.json`: **19391**
- `transactions_db.json`: **0**
- `bills_db.json`: **0**
- `sales_db.json`: **0**
- `purchases_db.json`: **0**
- `payments_db.json`: **0**
- `installments_db.json`: **0**
- `cashClosings_db.json`: **0**
- `expenses_db.json`: **0**
- `adminLedger_db.json`: **0**
- `users_db.json`: **3**
- `webauthn_credentials_db.json`: **6**
- `settings_db.json`: **1**

> **Nota:** Los datos de negocio, usuarios, configuraciones y credenciales biométricas persisten exclusivamente en el VPS de producción y están excluidos del repositorio de código.

---

## 2. Reconstrucción y Ejecución Local

### Instalación de dependencias:
```bash
npm ci
```

### Typecheck y Build:
```bash
npx tsc --noEmit
npm run build
```

### Ejecución en Desarrollo:
```bash
# Backend API y WebSocket:
node server.js

# Frontend Vite:
npm run dev
```

---

## 3. Arquitectura de Despliegue en VPS
- **Docker Compose Path:** `/root/kalu-crm-next/vps-deployment`
- **Comando de Despliegue / Recreación:**
```bash
docker compose --env-file /root/kalu-crm-next/.env up -d --build api web
```
