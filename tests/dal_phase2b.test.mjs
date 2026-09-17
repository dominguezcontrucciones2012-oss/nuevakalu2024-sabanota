import assert from 'assert';
import { createDatabaseConnection, initializeSchema } from '../db/connection.js';
import { createDAL, Money, Weight } from '../db/dal.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err);
    failed++;
  }
}

async function run() {
  console.log('\n==================================================');
  console.log('EJECUTANDO SUITE DE PRUEBAS DAL SQLITE — FASE 2B');
  console.log('==================================================\n');

  // Setup fresh in-memory database for testing
  const db = createDatabaseConnection(':memory:');
  initializeSchema(db);
  const dal = createDAL(db);

  // 2B-01: Schema creation
  await test('2B-01: Schema SQLite se inicializa correctamente con todas las tablas e índices', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;").all();
    const tableNames = tables.map(t => t.name);
    assert.ok(tableNames.includes('clients'), 'Debe incluir tabla clients');
    assert.ok(tableNames.includes('suppliers'), 'Debe incluir tabla suppliers');
    assert.ok(tableNames.includes('products'), 'Debe incluir tabla products');
    assert.ok(tableNames.includes('transactions'), 'Debe incluir tabla transactions');
    assert.ok(tableNames.includes('transaction_items'), 'Debe incluir tabla transaction_items');
    assert.ok(tableNames.includes('installments'), 'Debe incluir tabla installments');
    assert.ok(tableNames.includes('kardex_movements'), 'Debe incluir tabla kardex_movements');
    assert.ok(tableNames.includes('audit_logs'), 'Debe incluir tabla audit_logs');
  });

  // 2B-02: Foreign keys enforcement
  await test('2B-02: Foreign keys activas impiden insertar cuota o transacción con cliente inexistente', () => {
    assert.throws(() => {
      dal.installments.create({
        id: 'inst-orphan-1',
        clientId: 'cli-nonexistent',
        transactionId: 'tx-nonexistent',
        amount: 50,
        dueDate: '2026-12-31'
      });
    }, /FOREIGN KEY constraint failed/);
  });

  // 2B-03: Unique constraints
  await test('2B-03: Unique constraint en users impide duplicación de username', () => {
    const insertUser = db.prepare(`
      INSERT INTO users (id, username, password_hash, name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `);
    const now = new Date().toISOString();
    insertUser.run('u1', 'admin_test', 'hash1', 'Admin', 'admin', now, now);

    assert.throws(() => {
      insertUser.run('u2', 'admin_test', 'hash2', 'Admin 2', 'admin', now, now);
    }, /UNIQUE constraint failed/);
  });

  // 2B-04: Insert entity with exact fields
  await test('2B-04: Inserción de cliente preserva todos los campos estructurados', () => {
    const client = dal.clients.create({
      id: 'cli-test-01',
      name: 'Cliente Prueba 2B',
      cedula: 'V-12345678',
      phone: '+584141234567',
      email: 'prueba2b@kalu.local',
      outstandingDebt: 150.75,
      loyaltyPoints: 25,
      metadata: { taxType: 'Ordinario', creditApproved: true }
    });

    assert.strictEqual(client.id, 'cli-test-01');
    assert.strictEqual(client.name, 'Cliente Prueba 2B');
    assert.strictEqual(client.outstanding_debt_cents, 15075);
    assert.strictEqual(Money.fromCents(client.outstanding_debt_cents), 150.75);
    assert.deepStrictEqual(JSON.parse(client.metadata), { taxType: 'Ordinario', creditApproved: true });
  });

  // 2B-05: Update entity (debt/stock)
  await test('2B-05: Actualización de saldo de deuda y stock de producto en DAL', () => {
    const prod = dal.products.create({
      id: 'prod-test-01',
      barcode: '7591234567890',
      name: 'Queso Duro Santa Rita',
      category: 'Fresco',
      unit: 'Kg',
      stockKg: 50.500,
      purchasePrice: 4.50,
      sellingPrice: 6.00
    });
    assert.strictEqual(prod.stock_grams, 50500);

    const updated = dal.products.updateStock('prod-test-01', 42.250);
    assert.strictEqual(updated.stock_grams, 42250);
    assert.strictEqual(Weight.fromGrams(updated.stock_grams), 42.25);
  });

  // 2B-06: Multi-entity transaction commit
  await test('2B-06: withTransaction confirma operaciones multi-entidad atómicamente', () => {
    dal.withTransaction((txDb) => {
      dal.clients.updateDebt('cli-test-01', 200.00);
      dal.products.updateStock('prod-test-01', 30.000);
      dal.kardex.create({
        id: 'kardex-tx-01',
        productId: 'prod-test-01',
        productName: 'Queso Duro Santa Rita',
        type: 'SALIDA_VENTA',
        quantity: 12.250,
        previousStock: 42.250,
        newStock: 30.000,
        unitCost: 4.50,
        totalCost: 55.125
      });
    });

    const c = dal.clients.findById('cli-test-01');
    const p = dal.products.findById('prod-test-01');
    const k = dal.kardex.findById('kardex-tx-01');

    assert.strictEqual(c.outstanding_debt_cents, 20000);
    assert.strictEqual(p.stock_grams, 30000);
    assert.ok(k);
    assert.strictEqual(k.quantity_milli, 12250);
  });

  // 2B-07: Multi-entity transaction rollback
  await test('2B-07: withTransaction revierte todas las modificaciones previas si ocurre un fallo intermedio', () => {
    const initialClientDebt = dal.clients.findById('cli-test-01').outstanding_debt_cents;
    const initialStock = dal.products.findById('prod-test-01').stock_grams;

    assert.throws(() => {
      dal.withTransaction((txDb) => {
        // Step A: Modify client debt (would succeed alone)
        dal.clients.updateDebt('cli-test-01', 999.99);

        // Step B: Modify stock (would succeed alone)
        dal.products.updateStock('prod-test-01', 1.000);

        // Step C: Intentional constraint violation / error
        throw new Error('Forced simulation exception in step C');
      });
    }, /Forced simulation exception/);

    // Verify complete rollback in SQLite
    const postClient = dal.clients.findById('cli-test-01');
    const postProd = dal.products.findById('prod-test-01');

    assert.strictEqual(postClient.outstanding_debt_cents, initialClientDebt, 'Deuda debe revertirse al valor inicial');
    assert.strictEqual(postProd.stock_grams, initialStock, 'Stock debe revertirse al valor inicial');
  });

  // 2B-08: Transaction & Items relational consistency
  await test('2B-08: Transacción de venta almacena cabecera y renglones de detalle vinculados', () => {
    const tx = dal.transactions.create({
      id: 'tx-sale-01',
      invoiceNumber: 'INV-2B-001',
      clientId: 'cli-test-01',
      amount: 60.00,
      category: 'ventas',
      status: 'Completado',
      paymentMethod: 'Efectivo USD'
    }, [
      { productId: 'prod-test-01', productName: 'Queso Duro', quantityKg: 10, pricePerKg: 6.00, subtotal: 60.00 }
    ]);

    assert.strictEqual(tx.id, 'tx-sale-01');
    assert.strictEqual(tx.amount_cents, 6000);

    const items = dal.transactions.getItems('tx-sale-01');
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].product_id, 'prod-test-01');
    assert.strictEqual(items[0].subtotal_cents, 6000);
  });

  // 2B-09: Prepared statements and SQL injection protection
  await test('2B-09: Prepared statements neutralizan intentos de inyección SQL en parámetros', () => {
    const maliciousName = "Hacker' OR '1'='1'; DROP TABLE clients; --";
    const client = dal.clients.create({
      id: 'cli-inject-01',
      name: maliciousName,
      cedula: 'V-99999999'
    });

    assert.strictEqual(client.name, maliciousName);
    // Ensure table still exists and wasn't dropped
    const count = dal.clients.count();
    assert.ok(count >= 2);
  });

  // 2B-10: Audit log is strictly append-only
  await test('2B-10: AuditLogRepository opera exclusivamente en modo append-only sin métodos de mutación', () => {
    dal.auditLogs.append({
      id: 'audit-2b-01',
      action: 'pos.process_sale',
      resourceType: 'transaction',
      resourceId: 'tx-sale-01',
      actorType: 'crm_user',
      actorId: 'u1',
      actorRole: 'cajero',
      result: 'success',
      metadata: { totalAmount: 60.00, invoice: 'INV-2B-001' }
    });

    const log = dal.auditLogs.findById('audit-2b-01');
    assert.ok(log);
    assert.strictEqual(log.action, 'pos.process_sale');
    assert.strictEqual(log.actor_role, 'cajero');

    // Verify DAL interface does NOT expose update or delete methods
    assert.strictEqual(dal.auditLogs.update, undefined, 'AuditLogRepository no debe exponer update');
    assert.strictEqual(dal.auditLogs.delete, undefined, 'AuditLogRepository no debe exponer delete');
    assert.strictEqual(dal.auditLogs.deleteById, undefined, 'AuditLogRepository no debe exponer deleteById');
  });

  // 2B-11: Money & Weight precision converters
  await test('2B-11: Utilitarios Money y Weight garantizan conversión exacta sin pérdida de punto flotante', () => {
    assert.strictEqual(Money.toCents(12.50), 1250);
    assert.strictEqual(Money.toCents(0.01), 1);
    assert.strictEqual(Money.toCents(199.99), 19999);
    assert.strictEqual(Money.fromCents(19999), 199.99);

    assert.strictEqual(Weight.toGrams(1.500), 1500);
    assert.strictEqual(Weight.toGrams(0.005), 5);
    assert.strictEqual(Weight.fromGrams(1500), 1.5);
  });

  // 2B-12: ID preservation
  await test('2B-12: DAL preserva intactos IDs personalizados tipo string (cli-demo-1, sup-demo-2)', () => {
    const supplier = dal.suppliers.create({
      id: 'sup-producer-kalu-99',
      name: 'Productor Don Pedro',
      rif: 'J-987654321',
      isCheeseProducer: true,
      balanceOwed: 500.00,
      storeDebt: 50.00
    });

    assert.strictEqual(supplier.id, 'sup-producer-kalu-99');
    assert.strictEqual(supplier.is_cheese_producer, 1);
    assert.strictEqual(supplier.balance_owed_cents, 50000);
    assert.strictEqual(supplier.store_debt_cents, 5000);
  });

  // 2B-13: JSON shape compatibility
  await test('2B-13: Estructuras complejas anidadas (barcodes, creditData, metadata) se serializan limpiamente en columnas JSON', () => {
    const barcodesList = ['7590001', '7590002', '7590003'];
    const prod = dal.products.create({
      id: 'prod-json-01',
      name: 'Queso Telita Especial',
      category: 'Fresco',
      barcodes: barcodesList
    });

    const retrieved = dal.products.findById('prod-json-01');
    assert.deepStrictEqual(JSON.parse(retrieved.barcodes), barcodesList);
  });

  // 2B-14: Legacy mapping representation
  await test('2B-14: Tablas legacy de preservación permiten registrar y consultar histórico sin conflictos', () => {
    const insertLegacy = db.prepare(`
      INSERT INTO legacy_ventas (id, fecha, cliente_id, total_usd_cents, es_fiado, pagada)
      VALUES (?, ?, ?, ?, ?, ?);
    `);
    insertLegacy.run(7358, '2026-03-16 10:00:00', 29, 4500, 0, 1);

    const legacyRow = db.prepare('SELECT * FROM legacy_ventas WHERE id = 7358;').get();
    assert.ok(legacyRow);
    assert.strictEqual(legacyRow.total_usd_cents, 4500);
    assert.strictEqual(legacyRow.cliente_id, 29);
  });

  console.log('\n==================================================');
  console.log(`RESULTADO DAL FASE 2B: ${passed} PASADAS / ${failed} FALLIDAS`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error running DAL tests:', err);
  process.exit(1);
});
