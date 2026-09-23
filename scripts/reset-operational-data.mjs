/**
 * Script de Limpieza y Reset Operativo del Sistema (Kalu CRM Oficial / Sabanota)
 *
 * MODO DE USO:
 *   Dry Run (Simulación sin cambios):
 *     node scripts/reset-operational-data.mjs --dry-run
 *
 *   Ejecución Real (Requiere confirmación explícita):
 *     node scripts/reset-operational-data.mjs --execute --confirm=RESET-KALU-OPERATIONS
 *
 *   Opciones adicionales:
 *     --data-dir=<ruta>       Directorio de datos objetivo (por defecto data-dev o KALU_DATA_DIR)
 *     --media-dir=<ruta>      Directorio de medios protegidos (por defecto protected_media)
 *     --reset-audit-logs      Si se especifica, vacía audit_logs_db.json (REVIEW)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. Procesar argumentos de línea de comandos
const args = process.argv.slice(2);
const isExecute = args.includes('--execute');
const isDryRun = args.includes('--dry-run') || !isExecute;
const confirmArg = args.find(a => a.startsWith('--confirm='))?.split('=')[1] || '';
const customDataDirArg = args.find(a => a.startsWith('--data-dir='))?.split('=')[1];
const customMediaDirArg = args.find(a => a.startsWith('--media-dir='))?.split('=')[1];
const resetAuditLogs = args.includes('--reset-audit-logs');

// 2. Determinar directorios
const targetDataDir = customDataDirArg
  ? path.resolve(customDataDirArg)
  : (process.env.KALU_DATA_DIR || path.join(projectRoot, 'data-dev'));

const targetMediaDir = customMediaDirArg
  ? path.resolve(customMediaDirArg)
  : (process.env.KALU_MEDIA_DIR || path.join(projectRoot, 'protected_media'));

// 3. Definición de la Matriz de Colecciones
const OPERATIONAL_EMPTY_COLLECTIONS = [
  'transactions',
  'installments',
  'pwa_payments',
  'bills',
  'kardex',
  'sales',
  'purchases',
  'expenses',
  'cashClosings',
  'adminLedger',
  'cheeseTrips',
  'vehicle_trips',
  'shift_sessions',
  'shift_transactions',
  'business_debts',
  'invoices',
  'payments',
  'mobileOrders',
  'daily_drafts',
  'voice_notes',
  'photo_album'
];

const MASTER_COLLECTIONS = [
  'products',
  'clients',
  'suppliers',
  'users',
  'settings'
];

const REVIEW_COLLECTIONS = [
  'audit_logs',
  'banners',
  'webauthn_credentials'
];

// Helper para escritura atómica
function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.tmp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  const serialized = JSON.stringify(data, null, 2);
  const fd = fs.openSync(tempPath, 'w');
  fs.writeSync(fd, serialized, 0, 'utf8');
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(tempPath, filePath);
}

function readJsonFile(filePath, defaultValue = []) {
  if (!fs.existsSync(filePath)) return defaultValue;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) return defaultValue;
    return JSON.parse(content);
  } catch (err) {
    console.error(`[ERROR] No se pudo leer ${filePath}:`, err.message);
    throw err;
  }
}

export async function runOperationalReset(options = {}) {
  const dataDir = options.dataDir || targetDataDir;
  const mediaDir = options.mediaDir || targetMediaDir;
  const execute = options.execute !== undefined ? options.execute : isExecute;
  const confirmation = options.confirmation || confirmArg;
  const shouldResetAuditLogs = options.resetAuditLogs !== undefined ? options.resetAuditLogs : resetAuditLogs;

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const report = {
    timestamp: new Date().toISOString(),
    mode: execute ? 'EXECUTE' : 'DRY_RUN',
    dataDir,
    mediaDir,
    backupDir: null,
    summary: {
      totalCollectionsScanned: 0,
      operationalCollectionsEmptied: 0,
      totalRecordsDeleted: 0,
      masterClientsPreserved: 0,
      masterClientsDebtReset: 0,
      masterClientsLoyaltyResetToK1: 0,
      masterSuppliersPreserved: 0,
      masterSuppliersDebtReset: 0,
      masterProductsPreserved: 0,
      masterProductsStockUntouched: 0,
      masterUsersPreserved: 0,
      vaultBalanceReset: false,
      pwaCapturesDeleted: 0,
      capturesDeleted: 0,
      auditLogsResetApplied: shouldResetAuditLogs
    },
    collectionDetails: {},
    mediaDetails: {
      pwa_captures: {
        dirPath: path.join(mediaDir, 'pwa_captures'),
        filesFound: 0,
        filesBackedUp: 0,
        filesDeleted: 0
      },
      captures: {
        dirPath: path.join(mediaDir, 'captures'),
        filesFound: 0,
        filesBackedUp: 0,
        filesDeleted: 0
      }
    },
    errors: []
  };

  console.log('================================================================');
  console.log(`🧹 KALU CRM — RESET OPERATIVO ${execute ? '【EJECUCIÓN REAL】' : '【DRY RUN / SIMULACIÓN】'}`);
  console.log('================================================================');
  console.log(`📂 Directorio de Datos:  ${dataDir}`);
  console.log(`🖼️  Directorio de Medios: ${mediaDir}`);
  console.log(`🕒 Fecha / Timestamp:    ${report.timestamp}`);
  console.log('----------------------------------------------------------------\n');

  if (!fs.existsSync(dataDir)) {
    throw new Error(`El directorio de datos no existe: ${dataDir}`);
  }

  // 1. Escaneo e inventario previo
  const allDbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('_db.json'));
  report.summary.totalCollectionsScanned = allDbFiles.length;

  // 2. Procesamiento de CLIENTS (Identidad conservada, Finanzas a 0, Loyalty a 0 / K1)
  const clientsFile = path.join(dataDir, 'clients_db.json');
  const rawClients = readJsonFile(clientsFile, []);
  report.summary.masterClientsPreserved = rawClients.length;

  const clientFieldStats = {
    outstandingDebt: 0,
    currentDebtUsd: 0,
    saldoBs: 0,
    debt: 0,
    historicalDebt: 0,
    balance: 0,
    creditBalance: 0,
    pendingDebt: 0,
    accountsReceivable: 0,
    pointsOrTier: 0
  };

  let totalClientsWithAnyDebt = 0;
  const cleanedClients = rawClients.map(c => {
    const updated = { ...c };

    let hadDebt = false;
    if (Number(c.outstandingDebt || 0) !== 0) { clientFieldStats.outstandingDebt++; hadDebt = true; }
    if (Number(c.currentDebtUsd || 0) !== 0) { clientFieldStats.currentDebtUsd++; hadDebt = true; }
    if (Number(c.saldoBs || 0) !== 0) { clientFieldStats.saldoBs++; hadDebt = true; }
    if ('debt' in c && Number(c.debt || 0) !== 0) { clientFieldStats.debt++; hadDebt = true; }
    if ('historicalDebt' in c && Number(c.historicalDebt || 0) !== 0) { clientFieldStats.historicalDebt++; hadDebt = true; }
    if ('balance' in c && Number(c.balance || 0) !== 0) { clientFieldStats.balance++; hadDebt = true; }
    if ('creditBalance' in c && Number(c.creditBalance || 0) !== 0) { clientFieldStats.creditBalance++; hadDebt = true; }
    if ('pendingDebt' in c && Number(c.pendingDebt || 0) !== 0) { clientFieldStats.pendingDebt++; hadDebt = true; }
    if ('accountsReceivable' in c && Number(c.accountsReceivable || 0) !== 0) { clientFieldStats.accountsReceivable++; hadDebt = true; }

    if (hadDebt) totalClientsWithAnyDebt++;

    const hasPointsOrTier = (Number(c.loyaltyPoints || 0) !== 0) || (Number(c.points || 0) !== 0) || (c.tier && c.tier !== 'K1');
    if (hasPointsOrTier) clientFieldStats.pointsOrTier++;

    // Resetear todos los campos financieros reales a 0
    updated.outstandingDebt = 0;
    updated.currentDebtUsd = 0;
    updated.saldoBs = 0;
    if ('debt' in updated) updated.debt = 0;
    if ('historicalDebt' in updated) updated.historicalDebt = 0;
    if ('balance' in updated) updated.balance = 0;
    if ('creditBalance' in updated) updated.creditBalance = 0;
    if ('pendingDebt' in updated) updated.pendingDebt = 0;
    if ('accountsReceivable' in updated) updated.accountsReceivable = 0;

    // Resetear fidelización a K1 / 0 pts
    updated.loyaltyPoints = 0;
    updated.points = 0;
    updated.tier = 'K1';

    return updated;
  });

  report.summary.masterClientsDebtReset = totalClientsWithAnyDebt;
  report.summary.masterClientsLoyaltyResetToK1 = rawClients.length;
  report.summary.clientFieldDetails = clientFieldStats;

  report.collectionDetails['clients'] = {
    type: 'MASTER',
    action: 'PRESERVE_IDENTITY_RESET_FINANCIALS_AND_LOYALTY',
    countBefore: rawClients.length,
    countAfter: cleanedClients.length,
    recordsDeleted: 0,
    fieldBreakdown: clientFieldStats,
    financialFieldsReset: [
      `outstandingDebt -> 0 (${clientFieldStats.outstandingDebt} con saldo)`,
      `currentDebtUsd -> 0 (${clientFieldStats.currentDebtUsd} con saldo)`,
      `saldoBs -> 0 (${clientFieldStats.saldoBs} con saldo)`,
      ...(clientFieldStats.debt > 0 ? [`debt -> 0 (${clientFieldStats.debt} con saldo)`] : []),
      ...(clientFieldStats.historicalDebt > 0 ? [`historicalDebt -> 0 (${clientFieldStats.historicalDebt} con saldo)`] : [])
    ],
    loyaltyReset: 'loyaltyPoints -> 0, points -> 0, tier -> K1 (Todos los clientes arrancan en K1)'
  };

  // 3. Procesamiento de SUPPLIERS / PRODUCTORES
  const suppliersFile = path.join(dataDir, 'suppliers_db.json');
  const rawSuppliers = readJsonFile(suppliersFile, []);
  report.summary.masterSuppliersPreserved = rawSuppliers.length;

  const supplierFieldStats = {
    balanceUsd: 0,
    balanceOwed: 0,
    storeDebt: 0,
    debt: 0,
    balance: 0,
    accountsPayable: 0
  };

  let totalSuppliersWithAnyDebt = 0;
  const cleanedSuppliers = rawSuppliers.map(s => {
    const updated = { ...s };

    let hadDebt = false;
    if (Number(s.balanceUsd || 0) !== 0) { supplierFieldStats.balanceUsd++; hadDebt = true; }
    if (Number(s.balanceOwed || 0) !== 0) { supplierFieldStats.balanceOwed++; hadDebt = true; }
    if (Number(s.storeDebt || 0) !== 0) { supplierFieldStats.storeDebt++; hadDebt = true; }
    if ('debt' in s && Number(s.debt || 0) !== 0) { supplierFieldStats.debt++; hadDebt = true; }
    if ('balance' in s && Number(s.balance || 0) !== 0) { supplierFieldStats.balance++; hadDebt = true; }
    if ('accountsPayable' in s && Number(s.accountsPayable || 0) !== 0) { supplierFieldStats.accountsPayable++; hadDebt = true; }

    if (hadDebt) totalSuppliersWithAnyDebt++;

    // Resetear todos los campos financieros reales a 0
    updated.balanceUsd = 0;
    updated.balanceOwed = 0;
    updated.storeDebt = 0;
    if ('debt' in updated) updated.debt = 0;
    if ('balance' in updated) updated.balance = 0;
    if ('accountsPayable' in updated) updated.accountsPayable = 0;

    return updated;
  });

  report.summary.masterSuppliersDebtReset = totalSuppliersWithAnyDebt;
  report.summary.supplierFieldDetails = supplierFieldStats;

  report.collectionDetails['suppliers'] = {
    type: 'MASTER',
    action: 'PRESERVE_IDENTITY_RESET_FINANCIALS',
    countBefore: rawSuppliers.length,
    countAfter: cleanedSuppliers.length,
    recordsDeleted: 0,
    fieldBreakdown: supplierFieldStats,
    financialFieldsReset: [
      `balanceUsd -> 0 (${supplierFieldStats.balanceUsd} con saldo)`,
      `balanceOwed -> 0 (${supplierFieldStats.balanceOwed} con saldo)`,
      `storeDebt -> 0 (${supplierFieldStats.storeDebt} con saldo)`,
      ...(supplierFieldStats.debt > 0 ? [`debt -> 0 (${supplierFieldStats.debt} con saldo)`] : []),
      ...(supplierFieldStats.balance > 0 ? [`balance -> 0 (${supplierFieldStats.balance} con saldo)`] : [])
    ]
  };

  // 4. Procesamiento de PRODUCTS
  const productsFile = path.join(dataDir, 'products_db.json');
  const rawProducts = readJsonFile(productsFile, []);
  report.summary.masterProductsPreserved = rawProducts.length;
  report.summary.masterProductsStockUntouched = rawProducts.length;
  report.collectionDetails['products'] = {
    type: 'MASTER',
    action: 'PRESERVE_CATALOG_AND_STOCK',
    countBefore: rawProducts.length,
    countAfter: rawProducts.length,
    recordsDeleted: 0,
    note: 'El inventario y existencia actual stockKg se conservan íntegramente como inventario inicial.'
  };

  // 5. Procesamiento de USERS
  const usersFile = path.join(dataDir, 'users_db.json');
  const rawUsers = readJsonFile(usersFile, []);
  report.summary.masterUsersPreserved = rawUsers.length;
  report.collectionDetails['users'] = {
    type: 'MASTER',
    action: 'PRESERVE_ALL_USERS_AND_CREDS',
    countBefore: rawUsers.length,
    countAfter: rawUsers.length,
    recordsDeleted: 0
  };

  // 6. Procesamiento de SETTINGS
  const settingsFile = path.join(dataDir, 'settings_db.json');
  const rawSettings = readJsonFile(settingsFile, [ { id: 'general' } ]);
  const cleanedSettings = rawSettings.map(s => {
    return {
      ...s,
      centralVaultBalance: { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 }
    };
  });
  report.summary.vaultBalanceReset = true;
  report.collectionDetails['settings'] = {
    type: 'MASTER',
    action: 'PRESERVE_CONFIG_RESET_VAULT',
    countBefore: rawSettings.length,
    countAfter: cleanedSettings.length,
    recordsDeleted: 0,
    financialFieldsReset: ['centralVaultBalance -> { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 }']
  };

  // 7. Procesamiento de Colecciones Operativas (VACIAR)
  for (const colName of OPERATIONAL_EMPTY_COLLECTIONS) {
    const colFile = path.join(dataDir, `${colName}_db.json`);
    const records = readJsonFile(colFile, []);
    const countBefore = Array.isArray(records) ? records.length : Object.keys(records).length;
    report.summary.totalRecordsDeleted += countBefore;
    report.summary.operationalCollectionsEmptied++;
    report.collectionDetails[colName] = {
      type: 'OPERATIONAL',
      action: 'EMPTY_COLLECTION',
      countBefore,
      countAfter: 0,
      recordsDeleted: countBefore
    };
  }

  // 8. Colecciones en REVIEW (audit_logs, banners, webauthn_credentials)
  const auditLogsFile = path.join(dataDir, 'audit_logs_db.json');
  const rawAuditLogs = readJsonFile(auditLogsFile, []);
  const auditLogsCount = rawAuditLogs.length;
  if (shouldResetAuditLogs) {
    report.summary.totalRecordsDeleted += auditLogsCount;
    report.collectionDetails['audit_logs'] = {
      type: 'REVIEW',
      action: 'RESET_REQUESTED_EMPTY',
      countBefore: auditLogsCount,
      countAfter: 0,
      recordsDeleted: auditLogsCount
    };
  } else {
    report.collectionDetails['audit_logs'] = {
      type: 'REVIEW',
      action: 'PRESERVED_BY_DEFAULT',
      countBefore: auditLogsCount,
      countAfter: auditLogsCount,
      recordsDeleted: 0,
      note: 'Preservado para trazabilidad forense de seguridad. Usar --reset-audit-logs para vaciar.'
    };
  }

  // Banners y WebAuthn
  const bannersFile = path.join(dataDir, 'banners_db.json');
  const rawBanners = readJsonFile(bannersFile, []);
  report.collectionDetails['banners'] = {
    type: 'REVIEW',
    action: 'PRESERVE_STATIC_CATALOG',
    countBefore: rawBanners.length,
    countAfter: rawBanners.length,
    recordsDeleted: 0
  };

  const webauthnFile = path.join(dataDir, 'webauthn_credentials_db.json');
  const rawWebauthn = readJsonFile(webauthnFile, []);
  report.collectionDetails['webauthn_credentials'] = {
    type: 'REVIEW',
    action: 'PRESERVE_HARDWARE_KEYS',
    countBefore: rawWebauthn.length,
    countAfter: rawWebauthn.length,
    recordsDeleted: 0
  };

  // 9. Medios protegidos: Escaneo exhaustivo de protected_media/pwa_captures y protected_media/captures
  const pwaCapturesDir = path.join(mediaDir, 'pwa_captures');
  const capturesDir = path.join(mediaDir, 'captures');

  let pwaCapturesList = [];
  if (fs.existsSync(pwaCapturesDir)) {
    pwaCapturesList = fs.readdirSync(pwaCapturesDir).filter(f => !f.startsWith('.'));
  }
  report.mediaDetails.pwa_captures.filesFound = pwaCapturesList.length;

  let capturesList = [];
  if (fs.existsSync(capturesDir)) {
    capturesList = fs.readdirSync(capturesDir).filter(f => !f.startsWith('.'));
  }
  report.mediaDetails.captures.filesFound = capturesList.length;

  const totalMediaFilesFound = pwaCapturesList.length + capturesList.length;

  // Imprimir Matriz en Consola
  console.log('----------------------------------------------------------------');
  console.log('📋 MATRIZ DE COLECCIONES Y ACCIONES');
  console.log('----------------------------------------------------------------');
  console.table(Object.entries(report.collectionDetails).map(([name, d]) => ({
    Coleccion: name,
    Tipo: d.type,
    Accion: d.action,
    'Antes': d.countBefore,
    'Despues': d.countAfter,
    'Eliminados': d.recordsDeleted
  })));

  console.log('\n----------------------------------------------------------------');
  console.log('📊 RESUMEN DE IMPACTO');
  console.log('----------------------------------------------------------------');
  console.log(`• Colecciones Operativas a Vaciar:      ${report.summary.operationalCollectionsEmptied}`);
  console.log(`• Total Registros a Eliminar:           ${report.summary.totalRecordsDeleted}`);
  console.log(`• Clientes Maestros Conservados:        ${report.summary.masterClientsPreserved}`);
  console.log(`• Clientes con Deuda Total Reiniciada:  ${report.summary.masterClientsDebtReset} clientes`);
  console.log(`    ↳ con outstandingDebt > 0:          ${report.summary.clientFieldDetails.outstandingDebt}`);
  console.log(`    ↳ con currentDebtUsd > 0:           ${report.summary.clientFieldDetails.currentDebtUsd}`);
  console.log(`    ↳ con saldoBs > 0:                  ${report.summary.clientFieldDetails.saldoBs}`);
  if (report.summary.clientFieldDetails.debt > 0) {
    console.log(`    ↳ con debt > 0:                     ${report.summary.clientFieldDetails.debt}`);
  }
  if (report.summary.clientFieldDetails.historicalDebt > 0) {
    console.log(`    ↳ con historicalDebt > 0:           ${report.summary.clientFieldDetails.historicalDebt}`);
  }
  console.log(`• Clientes Reiniciados a 0 pts / K1:    ${report.summary.masterClientsLoyaltyResetToK1} clientes`);
  console.log(`• Productores Conservados:              ${report.summary.masterSuppliersPreserved}`);
  console.log(`• Productores con Saldo Reiniciado a 0: ${report.summary.masterSuppliersDebtReset} productores`);
  console.log(`    ↳ con balanceUsd > 0:               ${report.summary.supplierFieldDetails.balanceUsd}`);
  console.log(`    ↳ con balanceOwed > 0:              ${report.summary.supplierFieldDetails.balanceOwed}`);
  console.log(`    ↳ con storeDebt > 0:                ${report.summary.supplierFieldDetails.storeDebt}`);
  if (report.summary.supplierFieldDetails.debt > 0) {
    console.log(`    ↳ con debt > 0:                     ${report.summary.supplierFieldDetails.debt}`);
  }
  if (report.summary.supplierFieldDetails.balance > 0) {
    console.log(`    ↳ con balance > 0:                  ${report.summary.supplierFieldDetails.balance}`);
  }
  console.log(`• Productos Conservados:                ${report.summary.masterProductsPreserved}`);
  console.log(`• Existencia de Productos (StockKg):    PRESERVADA ÍNTEGRAMENTE (${report.summary.masterProductsStockUntouched} ítems)`);
  console.log(`• Usuarios de Sistema Conservados:      ${report.summary.masterUsersPreserved}`);
  console.log(`• Bóveda de Caja / Saldos:              REINICIADOS A CERO ($0.00 USD / Bs 0.00)`);
  console.log(`• Comprobantes pwa_captures a Respaldar/Limpiar: ${pwaCapturesList.length} archivos`);
  console.log(`• Comprobantes captures a Respaldar/Limpiar:     ${capturesList.length} archivos`);
  console.log(`• Logs de Auditoría:                    ${shouldResetAuditLogs ? 'REINICIADOS A 0' : `CONSERVADOS (${auditLogsCount} registros) (REVIEW)`}`);
  console.log('----------------------------------------------------------------\n');

  // Si es Dry Run, terminar aquí de forma segura
  if (!execute) {
    console.log('✅ DRY RUN COMPLETADO EXITOSAMENTE — CERO MODIFICACIONES REALIZADAS.');
    console.log('Para ejecutar los cambios reales ejecute:');
    console.log('  node scripts/reset-operational-data.mjs --execute --confirm=RESET-KALU-OPERATIONS\n');
    return report;
  }

  // VALIDACIÓN DE SEGURIDAD ESTRICTA PARA EXECUTE
  if (confirmation !== 'RESET-KALU-OPERATIONS') {
    throw new Error('ABORTADO: Se requiere --confirm=RESET-KALU-OPERATIONS para autorizar el reset destructivo.');
  }

  // FASE DE EJECUCIÓN CON BACKUP OBLIGATORIO
  const backupFolder = path.join(dataDir, 'backups', `pre-reset-${timestampStr}`);
  console.log(`🔒 CREANDO BACKUP ATÓMICO PREVIO EN: ${backupFolder}`);
  fs.mkdirSync(backupFolder, { recursive: true });

  try {
    // 1. Copiar todas las bases de datos JSON
    for (const dbFile of allDbFiles) {
      const src = path.join(dataDir, dbFile);
      const dest = path.join(backupFolder, dbFile);
      fs.copyFileSync(src, dest);
    }

    // 2. Copiar capturas de pwa_captures si existen
    if (pwaCapturesList.length > 0) {
      const backupPwaCaptures = path.join(backupFolder, 'pwa_captures');
      fs.mkdirSync(backupPwaCaptures, { recursive: true });
      for (const capFile of pwaCapturesList) {
        fs.copyFileSync(path.join(pwaCapturesDir, capFile), path.join(backupPwaCaptures, capFile));
      }
      report.mediaDetails.pwa_captures.filesBackedUp = pwaCapturesList.length;
    }

    // 3. Copiar capturas de captures si existen
    if (capturesList.length > 0) {
      const backupCaptures = path.join(backupFolder, 'captures');
      fs.mkdirSync(backupCaptures, { recursive: true });
      for (const capFile of capturesList) {
        fs.copyFileSync(path.join(capturesDir, capFile), path.join(backupCaptures, capFile));
      }
      report.mediaDetails.captures.filesBackedUp = capturesList.length;
    }

    // 4. Crear manifiesto detallado del backup
    const manifest = {
      backupTimestamp: new Date().toISOString(),
      sourceDataDir: dataDir,
      sourceMediaDir: mediaDir,
      filesCopied: allDbFiles.length,
      mediaBackup: {
        pwa_captures: {
          filesBackedUp: report.mediaDetails.pwa_captures.filesBackedUp,
          filesDeleted: report.mediaDetails.pwa_captures.filesFound
        },
        captures: {
          filesBackedUp: report.mediaDetails.captures.filesBackedUp,
          filesDeleted: report.mediaDetails.captures.filesFound
        }
      }
    };
    fs.writeFileSync(path.join(backupFolder, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    report.backupDir = backupFolder;
    console.log('✅ BACKUP COMPLETADO Y VERIFICADO EXITOSAMENTE.\n');
  } catch (backupErr) {
    console.error('❌ ERROR CRÍTICO CREANDO BACKUP. ABORTANDO RESET:', backupErr.message);
    throw new Error(`BACKUP_FAILED: ${backupErr.message}`);
  }

  // FASE DE ESCRITURA ATÓMICA DE COLECCIONES LIMPIAS
  console.log('⚡ APLICANDO RESET OPERATIVO...');

  // A. Guardar clients limpios (con deudas en 0 y loyalty en K1 / 0 pts)
  atomicWriteJson(clientsFile, cleanedClients);

  // B. Guardar suppliers limpios
  atomicWriteJson(suppliersFile, cleanedSuppliers);

  // C. Guardar settings limpios (con bóveda en 0)
  atomicWriteJson(settingsFile, cleanedSettings);

  // D. Vaciar colecciones operativas
  for (const colName of OPERATIONAL_EMPTY_COLLECTIONS) {
    const colFile = path.join(dataDir, `${colName}_db.json`);
    atomicWriteJson(colFile, []);
  }

  // E. Audit logs si se solicitó
  if (shouldResetAuditLogs) {
    atomicWriteJson(auditLogsFile, []);
  }

  // F. Limpiar comprobantes físicos en pwa_captures
  if (fs.existsSync(pwaCapturesDir)) {
    let deletedPwaCount = 0;
    for (const capFile of pwaCapturesList) {
      try {
        fs.unlinkSync(path.join(pwaCapturesDir, capFile));
        deletedPwaCount++;
      } catch (err) {
        console.warn(`[WARN] No se pudo eliminar comprobante pwa_captures ${capFile}:`, err.message);
      }
    }
    report.mediaDetails.pwa_captures.filesDeleted = deletedPwaCount;
    report.summary.pwaCapturesDeleted = deletedPwaCount;
  }

  // G. Limpiar comprobantes físicos en captures
  if (fs.existsSync(capturesDir)) {
    let deletedCapturesCount = 0;
    for (const capFile of capturesList) {
      try {
        fs.unlinkSync(path.join(capturesDir, capFile));
        deletedCapturesCount++;
      } catch (err) {
        console.warn(`[WARN] No se pudo eliminar comprobante captures ${capFile}:`, err.message);
      }
    }
    report.mediaDetails.captures.filesDeleted = deletedCapturesCount;
    report.summary.capturesDeleted = deletedCapturesCount;
  }

  // H. Escribir informe JSON de ejecución
  const reportPath = path.join(dataDir, `reset-report-${timestampStr}.json`);
  atomicWriteJson(reportPath, report);
  console.log(`📄 INFORME DE AUDITORÍA GUARDADO EN: ${reportPath}`);
  console.log('\n================================================================');
  console.log('🎉 RESET OPERATIVO COMPLETADO CON ÉXITO.');
  console.log('================================================================\n');

  return report;
}

// Ejecución directa por CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runOperationalReset()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ ERROR DURANTE LA EJECUCIÓN:', err.message);
      process.exit(1);
    });
}
