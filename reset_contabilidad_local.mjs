import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, 'uploads');

console.log('========================================================');
console.log('   🧹 BORRÓN TOTAL Y PROFUNDO - KALU CRM (100% LOCAL)   ');
console.log('========================================================\n');

// 1. Colecciones que se vacían a [] (cero registros)
const collectionsToEmpty = [
  'transactions',
  'adminLedger',
  'cheeseTrips',
  'kardex',
  'sales',
  'expenses',
  'invoices',
  'shift_transactions',
  'shift_sessions',
  'cashClosings',
  'payments',
  'bills',
  'installments',
  'purchases',
  'pwa_payments',
  'mobileOrders',
  'trips',
  'vehicle_trips',
  'voice_notes',
  'admin_voice_pending',
  'daily_drafts',
  'photo_album',
  'business_debts'
];

for (const col of collectionsToEmpty) {
  const filePath = path.join(uploadDir, `${col}_db.json`);
  fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
  console.log(`✅ Colección ${col}_db.json vaciada a 0.`);
}

// 2. Bóveda Central y ajustes en settings_db.json -> Todo a 0
const settingsFile = path.join(uploadDir, 'settings_db.json');
if (fs.existsSync(settingsFile)) {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    const updatedSettings = settings.map(s => {
      if (s.id === 'general') {
        return {
          ...s,
          centralVaultBalance: {
            usd: 0,
            bs: 0,
            bankBs: 0,
            bankUsd: 0
          },
          defaultStartingCash: 0,
          sabanotaInitials: {
            drawerUsd: 0,
            drawerBs: 0,
            bankBalanceBs: 0,
            bankBalanceUsd: 0,
            totalCapital: 0
          }
        };
      }
      return s;
    });
    fs.writeFileSync(settingsFile, JSON.stringify(updatedSettings, null, 2), 'utf8');
    console.log(`✅ Bóveda Central y saldos en settings_db.json reseteados a $0.00.`);
  } catch (e) {
    console.error('Error procesando settings_db.json:', e);
  }
}

// 3. Fichas de Obreros / Trabajadores: Limpiar saldos residuales sin tocar a los Productores
const suppliersFile = path.join(uploadDir, 'suppliers_db.json');
if (fs.existsSync(suppliersFile)) {
  try {
    const suppliers = JSON.parse(fs.readFileSync(suppliersFile, 'utf8'));
    const updatedSuppliers = suppliers.map(s => {
      if (s.isEmployee === true) {
        return {
          ...s,
          balanceOwed: 0,
          storeDebt: 0,
          balance: 0,
          debt: 0
        };
      }
      // Productores de queso y proveedores comerciales se conservan 100% intactos
      return s;
    });
    fs.writeFileSync(suppliersFile, JSON.stringify(updatedSuppliers, null, 2), 'utf8');
    console.log(`✅ ${suppliers.length} Registros de Proveedores/Productores/Obreros procesados (Obreros en $0, Productores Intactos).`);
  } catch (e) {
    console.error('Error procesando suppliers_db.json:', e);
  }
}

// 4. Verificación de ZONAS SAGRADAS (NO SE MODIFICAN)
const productsFile = path.join(uploadDir, 'products_db.json');
const clientsFile = path.join(uploadDir, 'clients_db.json');

const productsCount = fs.existsSync(productsFile) ? JSON.parse(fs.readFileSync(productsFile, 'utf8')).length : 0;
const clientsCount = fs.existsSync(clientsFile) ? JSON.parse(fs.readFileSync(clientsFile, 'utf8')).length : 0;

console.log('\n========================================================');
console.log('🔒 ZONAS SAGRADAS CONFIRMADAS 100% INTACTAS:');
console.log(` - Inventario de Productos (products_db.json): ${productsCount} productos conservados.`);
console.log(` - Base de Clientes (clients_db.json): ${clientsCount} clientes conservados.`);
console.log(` - Productores de Queso: Fichas y datos preservados.`);
console.log('✨ ¡TODO EL HISTORIAL, TESORERÍA, GIRAS Y BÓVEDA EN CERO!');
console.log('========================================================');
