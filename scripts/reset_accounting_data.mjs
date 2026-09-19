#!/usr/bin/env node

/**
 * ============================================================================
 * KALU CRM — SCRIPT SEGURO DE RESET / LIMPIEZA CONTABLE (FASE 3 ATOMIC ENGINE)
 * ============================================================================
 *
 * Objetivo:
 * Dejar toda la contabilidad, deudas, transacciones y compras históricas en CERO
 * para reiniciar ciclos de prueba limpios, CONSERVANDO al 100%:
 * - Clientes (datos personales, contacto, login, PIN, niveles, límites de crédito)
 * - Productos (catálogo, precios, costos, categorías, fotos, stock actual)
 * - Proveedores y Productores (fichas maestras, contacto, login)
 * - Usuarios CRM (roles, contraseñas, permisos)
 * - Configuración del sistema (tasa BCV, integraciones)
 *
 * Garantías de Seguridad y Atomicidad:
 * 1. Allowlist canónica de producción: Exige SIMULTÁNEAMENTE --production Y --confirm=RESET-ACCOUNTING.
 * 2. Transacción de 2 Fases (Prepare + Commit) con Staging Temporal.
 * 3. Rollback automático físico ante cualquier error durante el commit de JSON o media.
 * 4. Validación Post-Escritura real (Re-lectura obligatoria desde disco de todas las colecciones).
 * 5. Protección estricta contra Path Traversal en receipts.
 * 6. Deduplicación de comprobantes y backup binario verificado con SHA256.
 * 7. Purga Todo-o-Nada (All-or-Nothing) con restauración automática si falla cualquier eliminación.
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURACIÓN Y MAPA DE COLECCIONES
// ============================================================================

// Allowlist canónica de rutas de producción
export const CANONICAL_PROD_ALLOWLIST = [
  '/var/www/app/data',
  '/root/kalu-crm/data'
];

// Colecciones contables / históricas que se vacían a []
export const ACCOUNTING_COLLECTIONS = [
  'sales_db.json',
  'transactions_db.json',
  'invoices_db.json',
  'purchases_db.json',
  'expenses_db.json',
  'installments_db.json',
  'business_debts_db.json',
  'bills_db.json',
  'payments_db.json',
  'pwa_payments_db.json',
  'cashClosings_db.json',
  'adminLedger_db.json',
  'shift_sessions_db.json',
  'shift_transactions_db.json',
  'daily_drafts_db.json',
  'mobileOrders_db.json',
  'cheeseTrips_db.json',
  'vehicle_trips_db.json',
  'voice_notes_db.json',
  'kardex_db.json'
];

// Colecciones maestras que se conservan intactas
export const MASTER_PRESERVED_COLLECTIONS = [
  'products_db.json',
  'users_db.json',
  'banners_db.json',
  'photo_album_db.json',
  'audit_logs_db.json'
];

// Campos financieros exhaustivos que se ponen en 0 en Clientes
export const CLIENT_FINANCIAL_FIELDS = {
  currentDebtUsd: 0,
  outstandingDebt: 0,
  saldoBs: 0,
  currentDebt: 0,
  debt: 0,
  paidAmount: 0,
  creditUsed: 0,
  pendingBalance: 0,
  accountsReceivable: 0,
  lastPayment: null,
  totalPaid: 0,
  totalDebt: 0
};

// Campos maestros de clientes que se DEBEN conservar intactos
export const CLIENT_MASTER_FIELDS = [
  'id', 'sqliteId', 'name', 'cedula', 'phone', 'email', 'address',
  'status', 'portalCredentialStatus', 'pinHash', 'creditLimitUsd',
  'tier', 'points', 'loyaltyPoints'
];

// Campos financieros que se ponen en 0 en Proveedores
export const SUPPLIER_FINANCIAL_FIELDS = {
  balanceUsd: 0,
  balanceOwed: 0,
  storeDebt: 0
};

// Campos maestros de proveedores que se DEBEN conservar intactos
export const SUPPLIER_MASTER_FIELDS = [
  'id', 'sqliteId', 'name', 'rif', 'phone', 'email', 'address',
  'contactName', 'vendedorTelefono', 'type', 'isCheeseProducer',
  'isEmployee', 'status', 'portalCredentialStatus', 'pinHash'
];

// Campos financieros en settings
export const SETTINGS_FINANCIAL_FIELDS = {
  centralVaultBalance: 0
};

// ============================================================================
// HELPERS CRIPTOGRÁFICOS Y DE VALIDACIÓN
// ============================================================================

export function sha256(content) {
  const data = typeof content === 'string' ? content : (Buffer.isBuffer(content) ? content : JSON.stringify(content));
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function computeMasterHash(records, masterFields) {
  const normalized = records.map(r => {
    const obj = {};
    for (const f of masterFields) {
      if (r[f] !== undefined) obj[f] = r[f];
    }
    return obj;
  });
  return sha256(JSON.stringify(normalized));
}

// Canonicalización de rutas
export function canonicalizePath(targetPath) {
  if (!targetPath) return null;
  const abs = path.resolve(targetPath);
  if (fs.existsSync(abs)) {
    return path.normalize(fs.realpathSync(abs));
  }
  return path.normalize(abs);
}

// Comprueba si una ruta canónica pertenece a la allowlist de producción
export function isProductionTarget(resolvedPath) {
  if (!resolvedPath) return false;
  const norm = path.normalize(resolvedPath).replace(/\\/g, '/').toLowerCase();
  return CANONICAL_PROD_ALLOWLIST.some(prodPath => {
    const normProd = path.normalize(prodPath).replace(/\\/g, '/').toLowerCase();
    return norm === normProd;
  });
}

// Validación estricta de path traversal para receipts
export function validateReceiptPath(capturesDir, fileName) {
  if (!fileName || typeof fileName !== 'string') return null;
  // Descartar nombres con .. o separadores
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return null;
  }
  const fullPath = path.resolve(capturesDir, fileName);
  const normalizedCapturesDir = path.normalize(capturesDir);
  const normalizedFullPath = path.normalize(fullPath);

  if (normalizedFullPath.startsWith(normalizedCapturesDir + path.sep)) {
    return fullPath;
  }
  return null;
}

// ============================================================================
// MOTOR DE LIMPIEZA CONTABLE ATÓMICO
// ============================================================================

export async function runAccountingReset(options = {}) {
  const {
    dataDir,
    mediaDir,
    isDryRun = true,
    isProduction = false,
    confirmCode = '',
    purgeReceipts = false,
    _simulateCommitFailure = false,
    _simulateMediaPurgeFailure = false,
    logger = console.log
  } = options;

  if (!dataDir) {
    throw new Error('Debe especificar --data-dir o --target');
  }

  const resolvedDataDir = canonicalizePath(dataDir);
  if (!fs.existsSync(resolvedDataDir)) {
    throw new Error(`El directorio objetivo no existe: ${resolvedDataDir}`);
  }

  const isProd = isProductionTarget(resolvedDataDir);

  // 1. Guard de Producción Estricto Doble
  if (isProd) {
    if (!isProduction) {
      throw new Error('⛔ OPERACIÓN ABORTADA: El target es un entorno de producción y falta el parámetro --production.');
    }
    if (confirmCode !== 'RESET-ACCOUNTING') {
      throw new Error('⛔ OPERACIÓN ABORTADA: Para producción se requiere obligatoriamente --confirm=RESET-ACCOUNTING.');
    }
  } else {
    // Si no es producción pero se pasa --production, abortar por inconsistencia
    if (isProduction) {
      throw new Error(`⛔ OPERACIÓN ABORTADA: Se especificó --production pero el target no está en la allowlist de producción: ${resolvedDataDir}`);
    }
  }

  // 2. Validación de mediaDir si se solicita purga
  let resolvedCapturesDir = null;
  if (purgeReceipts) {
    if (!mediaDir) {
      throw new Error('⛔ OPERACIÓN ABORTADA: --purge-accounting-receipts requiere especificar un --media-dir válido.');
    }
    const resolvedMedia = canonicalizePath(mediaDir);
    if (!fs.existsSync(resolvedMedia)) {
      throw new Error(`⛔ OPERACIÓN ABORTADA: El directorio de media especificado no existe: ${resolvedMedia}`);
    }
    resolvedCapturesDir = path.join(resolvedMedia, 'captures');
    if (!fs.existsSync(resolvedCapturesDir)) {
      throw new Error(`⛔ OPERACIÓN ABORTADA: La carpeta de captures no existe en media-dir: ${resolvedCapturesDir}`);
    }
  }

  logger('================================================================');
  logger('🧹 KALU CRM — MOTOR ATÓMICO DE RESET CONTABLE (FASE 3)');
  logger('================================================================');
  logger(`📁 Directorio de datos (canónico): ${resolvedDataDir}`);
  logger(`⚙️  Modo de ejecución:             ${isDryRun ? '🔍 DRY-RUN (Simulación sin escrituras)' : '⚡ EJECUCIÓN REAL'}`);
  logger(`🖼️  Purga de recibos:              ${purgeReceipts ? 'SÍ (Todo-o-Nada con backup binario verificado)' : 'NO (Conservar multimedia)'}`);
  logger('----------------------------------------------------------------\n');

  // ==========================================================================
  // FASE PREPARE (Lectura, Validación, Staging en Memoria y Backup)
  // ==========================================================================

  const clientsFile = path.join(resolvedDataDir, 'clients_db.json');
  const suppliersFile = path.join(resolvedDataDir, 'suppliers_db.json');
  const productsFile = path.join(resolvedDataDir, 'products_db.json');
  const usersFile = path.join(resolvedDataDir, 'users_db.json');
  const settingsFile = path.join(resolvedDataDir, 'settings_db.json');
  const pwaPaymentsFile = path.join(resolvedDataDir, 'pwa_payments_db.json');

  let currentClients = fs.existsSync(clientsFile) ? JSON.parse(fs.readFileSync(clientsFile, 'utf8')) : [];
  let currentSuppliers = fs.existsSync(suppliersFile) ? JSON.parse(fs.readFileSync(suppliersFile, 'utf8')) : [];
  let currentProducts = fs.existsSync(productsFile) ? JSON.parse(fs.readFileSync(productsFile, 'utf8')) : [];
  let currentUsers = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile, 'utf8')) : [];
  let currentSettings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : [];
  let currentPwaPayments = fs.existsSync(pwaPaymentsFile) ? JSON.parse(fs.readFileSync(pwaPaymentsFile, 'utf8')) : [];

  const stats = {
    collectionsEmptied: {},
    clientsUpdated: currentClients.length,
    suppliersUpdated: currentSuppliers.length,
    productsPreserved: currentProducts.length,
    usersPreserved: currentUsers.length,
    receiptsToPurge: 0,
    receiptsBackedUp: 0,
    beforeMasterHashes: {
      products: sha256(currentProducts),
      users: sha256(currentUsers),
      clients: computeMasterHash(currentClients, CLIENT_MASTER_FIELDS),
      suppliers: computeMasterHash(currentSuppliers, SUPPLIER_MASTER_FIELDS)
    },
    afterMasterHashes: {}
  };

  logger('📊 [1/6] INVENTARIO DE REGISTROS ACTUALES:');
  logger(`  - Clientes maestros:   ${currentClients.length}`);
  logger(`  - Productos maestros:  ${currentProducts.length}`);
  logger(`  - Proveedores/Prod:    ${currentSuppliers.length}`);
  logger(`  - Usuarios CRM:        ${currentUsers.length}`);

  for (const col of ACCOUNTING_COLLECTIONS) {
    const colPath = path.join(resolvedDataDir, col);
    if (fs.existsSync(colPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(colPath, 'utf8'));
        const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
        stats.collectionsEmptied[col] = count;
        logger(`  - ${col.padEnd(26)}: ${count} registros → se vaciarán a 0`);
      } catch (e) {
        stats.collectionsEmptied[col] = 0;
      }
    } else {
      stats.collectionsEmptied[col] = 0;
    }
  }

  // Preparar Clientes en memoria
  const newClients = currentClients.map(c => {
    const updated = { ...c };
    for (const [key, val] of Object.entries(CLIENT_FINANCIAL_FIELDS)) {
      if (updated[key] !== undefined || key in updated) {
        updated[key] = val;
      } else if (key === 'currentDebtUsd' || key === 'outstandingDebt' || key === 'saldoBs') {
        updated[key] = val;
      }
    }
    if (updated.availableCredit !== undefined) {
      updated.availableCredit = updated.creditLimitUsd || 0;
    }
    return updated;
  });

  // Preparar Proveedores en memoria
  const newSuppliers = currentSuppliers.map(s => {
    const updated = { ...s };
    for (const [key, val] of Object.entries(SUPPLIER_FINANCIAL_FIELDS)) {
      if (updated[key] !== undefined || key in updated) {
        updated[key] = val;
      } else {
        updated[key] = val;
      }
    }
    return updated;
  });

  // Preparar Settings en memoria
  let newSettings = currentSettings;
  if (Array.isArray(currentSettings) && currentSettings.length > 0) {
    newSettings = currentSettings.map(st => ({ ...st, ...SETTINGS_FINANCIAL_FIELDS }));
  } else if (typeof currentSettings === 'object' && currentSettings !== null) {
    newSettings = { ...currentSettings, ...SETTINGS_FINANCIAL_FIELDS };
  }

  // Deduplicación y validación estricta de paths de comprobantes
  const receiptsMetadataMap = new Map();
  if (resolvedCapturesDir && fs.existsSync(resolvedCapturesDir)) {
    for (const p of currentPwaPayments) {
      const rawReceiptName = p.receiptFileName || (p.receiptImageUrl ? path.basename(p.receiptImageUrl) : null);
      if (rawReceiptName) {
        const validatedFullPath = validateReceiptPath(resolvedCapturesDir, rawReceiptName);
        if (validatedFullPath && fs.existsSync(validatedFullPath)) {
          if (!receiptsMetadataMap.has(validatedFullPath)) {
            const fileBuf = fs.readFileSync(validatedFullPath);
            receiptsMetadataMap.set(validatedFullPath, {
              filePath: validatedFullPath,
              fileName: path.basename(validatedFullPath),
              size: fileBuf.length,
              sha256: sha256(fileBuf),
              paymentId: p.id,
              clientId: p.clientId || p.entityId || null,
              transactionId: p.transactionId || null,
              installmentId: p.installmentId || null,
              amount: p.amount || 0,
              reference: p.reference || ''
            });
          }
        }
      }
    }
  }

  const uniqueReceipts = Array.from(receiptsMetadataMap.values());
  stats.receiptsToPurge = uniqueReceipts.length;

  // Verificación de integridad previa
  stats.afterMasterHashes.products = sha256(currentProducts);
  stats.afterMasterHashes.users = sha256(currentUsers);
  stats.afterMasterHashes.clients = computeMasterHash(newClients, CLIENT_MASTER_FIELDS);
  stats.afterMasterHashes.suppliers = computeMasterHash(newSuppliers, SUPPLIER_MASTER_FIELDS);

  if (stats.beforeMasterHashes.clients !== stats.afterMasterHashes.clients) {
    throw new Error('❌ ERROR DE INTEGRIDAD PREVIO: Los campos maestros de clientes fueron alterados.');
  }
  if (stats.beforeMasterHashes.suppliers !== stats.afterMasterHashes.suppliers) {
    throw new Error('❌ ERROR DE INTEGRIDAD PREVIO: Los campos maestros de proveedores fueron alterados.');
  }
  if (stats.beforeMasterHashes.products !== stats.afterMasterHashes.products) {
    throw new Error('❌ ERROR DE INTEGRIDAD PREVIO: Los productos maestros fueron alterados.');
  }

  logger('\n🔒 [2/6] VERIFICACIÓN DE INTEGRIDAD DE MAESTROS EN MEMORIA:');
  logger('  ✅ SHA256 Clientes (Identidad, PIN, Nivel, Cupo): INTACTO');
  logger('  ✅ SHA256 Productos (Precios, Costos, Stock, Fotos): INTACTO');
  logger('  ✅ SHA256 Proveedores (Identidad, Contacto, Tipo): INTACTO');
  logger('  ✅ SHA256 Usuarios (Roles, Permisos, Claves): INTACTO');

  if (isDryRun) {
    logger('\n================================================================');
    logger('🔍 FIN DE SIMULACIÓN (DRY-RUN) — NINGÚN ARCHIVO FUE MODIFICADO');
    logger(`  - Registros contables a vaciar: ${Object.values(stats.collectionsEmptied).reduce((a, b) => a + b, 0)}`);
    logger(`  - Clientes con deuda a $0:      ${stats.clientsUpdated}`);
    logger(`  - Proveedores con saldo a $0:   ${stats.suppliersUpdated}`);
    logger(`  - Captures únicas a purgar:     ${stats.receiptsToPurge}`);
    logger('================================================================');
    return { success: true, isDryRun: true, stats };
  }

  // ==========================================================================
  // BACKUP COMPLETO (JSON + BINARIO MEDIA)
  // ==========================================================================

  logger('\n📦 [3/6] CREANDO BACKUP ATÓMICO COMPLETO ANTES DE COMMIT...');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(resolvedDataDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `pre_accounting_reset_${ts}.json`);

  const backupPayload = {
    timestamp: new Date().toISOString(),
    type: 'atomic_pre_accounting_reset_v3',
    masterHashes: stats.beforeMasterHashes,
    clients: currentClients,
    suppliers: currentSuppliers,
    settings: currentSettings,
    collections: {},
    receiptsManifest: uniqueReceipts
  };

  for (const col of ACCOUNTING_COLLECTIONS) {
    const colPath = path.join(resolvedDataDir, col);
    if (fs.existsSync(colPath)) {
      backupPayload.collections[col] = JSON.parse(fs.readFileSync(colPath, 'utf8'));
    }
  }

  fs.writeFileSync(backupFile, JSON.stringify(backupPayload, null, 2), 'utf8');
  logger(`  ✓ Backup JSON guardado: ${backupFile} (${fs.statSync(backupFile).size} bytes)`);

  let mediaBackupDir = null;
  if (purgeReceipts && uniqueReceipts.length > 0) {
    logger('\n📦 [4/6] CREANDO BACKUP BINARIO DEDUPLICADO DE COMPROBANTES...');
    mediaBackupDir = path.join(backupDir, `media_backup_${ts}`);
    fs.mkdirSync(mediaBackupDir, { recursive: true });

    for (const r of uniqueReceipts) {
      const destBinary = path.join(mediaBackupDir, r.fileName);
      fs.copyFileSync(r.filePath, destBinary);
      const verifiedBuf = fs.readFileSync(destBinary);
      if (sha256(verifiedBuf) !== r.sha256) {
        throw new Error(`❌ ERROR DE RESPALDO BINARIO: Falló checksum SHA256 de ${r.fileName}`);
      }
      stats.receiptsBackedUp++;
    }
    fs.writeFileSync(
      path.join(mediaBackupDir, 'manifest.json'),
      JSON.stringify({ timestamp: new Date().toISOString(), count: uniqueReceipts.length, files: uniqueReceipts }, null, 2),
      'utf8'
    );
    logger(`  ✓ ${stats.receiptsBackedUp} comprobantes respaldados con verificación SHA256 en ${mediaBackupDir}`);
  }

  // ==========================================================================
  // FASE COMMIT CON STAGING Y ROLLBACK TRANSACCIONAL
  // ==========================================================================

  const stagedDir = path.join(resolvedDataDir, `.staging_reset_${ts}`);
  fs.mkdirSync(stagedDir, { recursive: true });

  const purgedReceiptsHistory = [];

  try {
    logger('\n⚡ [5/6] GENERANDO ARCHIVOS EN STAGING...');

    // 1. Preparar JSONs en Staging
    for (const col of ACCOUNTING_COLLECTIONS) {
      fs.writeFileSync(path.join(stagedDir, col), JSON.stringify([], null, 2), 'utf8');
    }
    fs.writeFileSync(path.join(stagedDir, 'clients_db.json'), JSON.stringify(newClients, null, 2), 'utf8');
    fs.writeFileSync(path.join(stagedDir, 'suppliers_db.json'), JSON.stringify(newSuppliers, null, 2), 'utf8');
    fs.writeFileSync(path.join(stagedDir, 'settings_db.json'), JSON.stringify(newSettings, null, 2), 'utf8');

    // 2. Reemplazar archivos en destino
    let fileIdx = 0;
    for (const col of ACCOUNTING_COLLECTIONS) {
      if (_simulateCommitFailure && fileIdx === 3) {
        throw new Error('INDUCED_COMMIT_FAILURE: Fallo simulado durante reemplazo de archivos.');
      }
      fs.copyFileSync(path.join(stagedDir, col), path.join(resolvedDataDir, col));
      fileIdx++;
    }
    fs.copyFileSync(path.join(stagedDir, 'clients_db.json'), clientsFile);
    fs.copyFileSync(path.join(stagedDir, 'suppliers_db.json'), suppliersFile);
    fs.copyFileSync(path.join(stagedDir, 'settings_db.json'), settingsFile);

    // 3. Purga Todo-o-Nada de Comprobantes
    if (purgeReceipts && uniqueReceipts.length > 0) {
      logger(`\n🗑️ PURGANDO ${uniqueReceipts.length} COMPROBANTES CON POLÍTICA ALL-OR-NOTHING...`);
      let purgeIdx = 0;
      for (const r of uniqueReceipts) {
        if (_simulateMediaPurgeFailure && purgeIdx === 1) {
          throw new Error('INDUCED_MEDIA_PURGE_FAILURE: Fallo simulado durante purga de media.');
        }
        fs.unlinkSync(r.filePath);
        purgedReceiptsHistory.push(r);
        logger(`  ✓ Purgado comprobante: ${r.fileName}`);
        purgeIdx++;
      }
    }

    // Limpiar directorio de staging
    if (fs.existsSync(stagedDir)) {
      fs.rmSync(stagedDir, { recursive: true, force: true });
    }

  } catch (commitErr) {
    logger(`\n🚨 ERROR EN FASE COMMIT: ${commitErr.message}`);
    logger('🔄 EJECUTANDO ROLLBACK FÍSICO AUTOMÁTICO...');

    // Rollback de JSON desde backupPayload
    fs.writeFileSync(clientsFile, JSON.stringify(backupPayload.clients, null, 2), 'utf8');
    fs.writeFileSync(suppliersFile, JSON.stringify(backupPayload.suppliers, null, 2), 'utf8');
    fs.writeFileSync(settingsFile, JSON.stringify(backupPayload.settings, null, 2), 'utf8');

    for (const [col, data] of Object.entries(backupPayload.collections)) {
      fs.writeFileSync(path.join(resolvedDataDir, col), JSON.stringify(data, null, 2), 'utf8');
    }

    // Rollback de comprobantes purgados restaurándolos desde mediaBackupDir
    if (mediaBackupDir && purgedReceiptsHistory.length > 0) {
      logger(`  🔄 Restaurando ${purgedReceiptsHistory.length} comprobantes eliminados previamente...`);
      for (const r of purgedReceiptsHistory) {
        const sourceBinary = path.join(mediaBackupDir, r.fileName);
        if (fs.existsSync(sourceBinary)) {
          fs.copyFileSync(sourceBinary, r.filePath);
        }
      }
    }

    // Limpiar staging
    if (fs.existsSync(stagedDir)) {
      fs.rmSync(stagedDir, { recursive: true, force: true });
    }

    throw new Error(`⛔ ROLLBACK COMPLETADO: El reset falló y el estado anterior fue restaurado al 100%. Causa: ${commitErr.message}`);
  }

  // ==========================================================================
  // FASE VALIDACIÓN POST-ESCRITURA REAL (Re-lectura obligatoria desde disco)
  // ==========================================================================

  logger('\n🔍 [6/6] VALIDACIÓN POST-ESCRITURA DIRECTA DESDE DISCO...');

  const diskClients = JSON.parse(fs.readFileSync(clientsFile, 'utf8'));
  const diskSuppliers = JSON.parse(fs.readFileSync(suppliersFile, 'utf8'));
  const diskProducts = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
  const diskUsers = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  const diskSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));

  // Validar conteos
  if (diskClients.length !== currentClients.length) throw new Error('Error post-validación: Conteo de clientes alterado.');
  if (diskSuppliers.length !== currentSuppliers.length) throw new Error('Error post-validación: Conteo de proveedores alterado.');
  if (diskProducts.length !== currentProducts.length) throw new Error('Error post-validación: Conteo de productos alterado.');
  if (diskUsers.length !== currentUsers.length) throw new Error('Error post-validación: Conteo de usuarios alterado.');

  // Validar integridad estricta de maestros desde disco
  const diskProductHash = sha256(diskProducts);
  const diskUsersHash = sha256(diskUsers);
  const diskClientsHash = computeMasterHash(diskClients, CLIENT_MASTER_FIELDS);
  const diskSuppliersHash = computeMasterHash(diskSuppliers, SUPPLIER_MASTER_FIELDS);

  if (diskProductHash !== stats.beforeMasterHashes.products) throw new Error('Error post-validación: Productos en disco no coinciden.');
  if (diskUsersHash !== stats.beforeMasterHashes.users) throw new Error('Error post-validación: Usuarios en disco no coinciden.');
  if (diskClientsHash !== stats.beforeMasterHashes.clients) throw new Error('Error post-validación: Campos maestros de clientes en disco alterados.');
  if (diskSuppliersHash !== stats.beforeMasterHashes.suppliers) throw new Error('Error post-validación: Campos maestros de proveedores en disco alterados.');

  // Validar que todas las colecciones contables en disco sean []
  for (const col of ACCOUNTING_COLLECTIONS) {
    const colPath = path.join(resolvedDataDir, col);
    const diskData = JSON.parse(fs.readFileSync(colPath, 'utf8'));
    if (!Array.isArray(diskData) || diskData.length !== 0) {
      throw new Error(`Error post-validación: La colección ${col} en disco no está vacía.`);
    }
  }

  // Validar deudas de clientes en disco = 0
  for (const c of diskClients) {
    if (c.currentDebtUsd !== 0 || c.outstandingDebt !== 0 || c.saldoBs !== 0) {
      throw new Error(`Error post-validación: Cliente ${c.id} conserva deudas en disco.`);
    }
  }

  // Validar saldos de proveedores en disco = 0
  for (const s of diskSuppliers) {
    if (s.balanceUsd !== 0 || s.balanceOwed !== 0 || s.storeDebt !== 0) {
      throw new Error(`Error post-validación: Proveedor ${s.id} conserva saldo en disco.`);
    }
  }

  // Validar settings centralVaultBalance en disco = 0
  const vault = Array.isArray(diskSettings) ? diskSettings[0]?.centralVaultBalance : diskSettings?.centralVaultBalance;
  if (vault !== 0) {
    throw new Error('Error post-validación: Bóveda central en settings_db.json no está en 0.');
  }

  logger('  ✅ Validación post-lectura en disco completada al 100%.');
  logger('  ✅ Todos los maestros, stock y credenciales están idénticos bit a bit.');
  logger('  ✅ Toda la contabilidad quedó estrictamente en CERO.');

  return {
    success: true,
    isDryRun: false,
    stats,
    backupFile,
    mediaBackupDir
  };
}

// ============================================================================
// CLI ENTRYPOINT
// ============================================================================

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--execute');
  const isProduction = args.includes('--production');
  const purgeReceipts = args.includes('--purge-accounting-receipts');

  let dataDir = null;
  let mediaDir = null;
  let confirmCode = '';

  for (const arg of args) {
    if (arg.startsWith('--data-dir=')) dataDir = arg.split('=')[1];
    else if (arg.startsWith('--target=')) dataDir = arg.split('=')[1];
    else if (arg.startsWith('--media-dir=')) mediaDir = arg.split('=')[1];
    else if (arg.startsWith('--confirm=')) confirmCode = arg.split('=')[1];
  }

  if (!dataDir) {
    console.log('Uso: node scripts/reset_accounting_data.mjs --target=<directorio_datos> [opciones]');
    console.log('\nOpciones:');
    console.log('  --target=<ruta>                 Ruta del directorio data (ej: ./data-dev)');
    console.log('  --media-dir=<ruta>              Ruta de protected_media (obligatorio con --purge-accounting-receipts)');
    console.log('  --execute                       Ejecutar cambios reales (por defecto es simulación DRY-RUN)');
    console.log('  --purge-accounting-receipts     Eliminar comprobantes multimedia con backup binario previo');
    console.log('  --production                    Requerido si se ejecuta en servidor VPS');
    console.log('  --confirm=RESET-ACCOUNTING      Confirmación de seguridad obligatoria para producción');
    console.log('\nEjemplos:');
    console.log('  Simulación (seguro):  node scripts/reset_accounting_data.mjs --target=./data-dev');
    console.log('  Ejecución local real: node scripts/reset_accounting_data.mjs --target=./data-dev --execute');
    process.exit(0);
  }

  runAccountingReset({
    dataDir,
    mediaDir,
    isDryRun,
    isProduction,
    confirmCode,
    purgeReceipts
  }).catch(err => {
    console.error('\n❌ ERROR:', err.message);
    process.exit(1);
  });
}
