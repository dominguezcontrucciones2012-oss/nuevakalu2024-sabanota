# 🛠️ KALU CRM — GUÍA DE CONFIGURACIÓN Y EJECUCIÓN DEL ENTORNO LOCAL DEV (KALU-DEV)

## 1. Requisitos Previos
- **Node.js**: v20.x o superior (Probado en `v24.18.0`)
- **Gestor de paquetes**: `npm` (Probado en `11.16.0` con `npm.cmd` en Windows)
- **Git**: Configurado en la máquina local

---

## 2. Principios de Seguridad y Aislamiento (Fase 0)
El entorno local **KALU-DEV** está 100% aislado del servidor de producción (Contabo):
1. **Base de Datos Aislada**: Todas las colecciones se leen y escriben en `./data-dev/` y nunca tocan `./uploads/` de producción.
2. **WhatsApp Simulado**: En modo desarrollo (`WHATSAPP_MODE=simulation`), los mensajes generados por el bot o cobranzas se imprimen en consola y nunca se envían a números reales.
3. **Email Simulado**: En modo desarrollo (`MAIL_MODE=development`), los correos se registran en la consola del servidor sin conectar con SMTP de Gmail.
4. **Protección de Despliegue**: El script de despliegue a Contabo (`deploy_seguro_produccion.mjs`) no debe ejecutarse en local.

---

## 3. Estructura de Archivos DEV
- `.env.example`: Plantilla pública y limpia con todas las variables requeridas.
- `.env.development`: Configuración automática para desarrollo local (`UPLOAD_DIR=./data-dev`, mocks de comunicación).
- `data-dev/`: Directorio que contiene las bases de datos sintéticas (JSON):
  - `products_db.json` (Productos de prueba)
  - `clients_db.json` (Clientes demo con límites de crédito)
  - `suppliers_db.json` (Proveedores y productores demo)
  - `users_db.json` (Usuarios para login DEV)
  - `settings_db.json` (Configuración general y tasa BCV de fallback)
  - Y las colecciones operativas vacías (`sales_db.json`, `transactions_db.json`, `kardex_db.json`, etc.)

---

## 4. Puertos de Ejecución Local
| Servicio | URL / Puerto | Descripción |
| :--- | :--- | :--- |
| **Frontend (Vite)** | `http://localhost:3000` | Interfaz Web React / CRM / Portales |
| **Backend (API)** | `http://localhost:3001/api` | Servidor Express / Endpoints REST |
| **WebSocket** | `ws://localhost:3001` | Sincronización en tiempo real Socket.io |

---

## 5. Instrucciones de Inicio

### Paso 1: Iniciar el Servidor Backend (API & DB DEV)
En una terminal:
```bash
# Windows PowerShell / CMD
npm.cmd run server
# o directamente:
node server.js
```
*Salida esperada:*
```text
🌐 ENTORNO: DESARROLLO LOCAL (KALU-DEV)
🤖 ESTADO DEL ROBOT DE COMUNICACIONES:
📧 Correo Emisor: MODO SIMULACIÓN (DEV - Solo consola)
📱 WhatsApp API: MODO SIMULACIÓN (DEV - Solo consola)
📂 Directorio de Datos / DB: ./data-dev
Backend server (Uploader & WS) running on port 3001
```

### Paso 2: Iniciar el Frontend (Vite)
En una segunda terminal:
```bash
npm.cmd run dev
```
*Salida esperada:*
```text
VITE v6.2.3 ready in ... ms
➜  Local:   http://localhost:3000/
```

---

## 6. Comandos de Verificación y Calidad

### Typecheck / Linting:
```bash
npm.cmd run lint
```

### Compilación Frontend (Build):
```bash
npm.cmd run build
```

---

## 7. Verificación de Aislamiento (¿Cómo saber si estás en DEV?)
- Al abrir `http://localhost:3000/api/settings` o inspeccionar el panel, verás la razón social `Mundo Kalu Sabanota (DEV Environment)`.
- En la consola de `node server.js`, toda interacción de cobranzas o WhatsApp aparecerá precedida de `[DEV/Simulado]`.
- Los cambios realizados en productos, ventas y clientes se reflejarán únicamente dentro de los archivos JSON en `data-dev/`.
