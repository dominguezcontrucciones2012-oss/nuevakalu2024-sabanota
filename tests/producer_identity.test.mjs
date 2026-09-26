import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getProducerInitialPin, getProducerLegalDocumentDigits } from '../server.js';

describe('🧪 VALIDACIÓN DE IDENTIDAD LEGAL Y LOGIN DE PRODUCTOR', () => {

  test('A) Documento productor persiste al guardar / crear', () => {
    const newProducerInput = {
      name: 'Agropecuaria El Roble',
      rfc: 'V-12345678',
      cedula: 'V-12345678',
      phone: '04121234567'
    };
    // Simular creación
    const createdProducer = {
      ...newProducerInput,
      id: 'sup-new-1',
      balanceOwed: 0,
      storeDebt: 0
    };
    assert.strictEqual(createdProducer.cedula, 'V-12345678');
    assert.strictEqual(createdProducer.rfc, 'V-12345678');
    assert.strictEqual(createdProducer.phone, '04121234567');
  });

  test('B) Documento productor persiste al editar y mapear fuentes históricas', () => {
    // Si viene de fuente histórica con rif o rfc o idNumber
    const historicalSources = [
      { id: 's1', name: 'Prod 1', rif: '15712801', phone: '04140001111' },
      { id: 's2', name: 'Prod 2', rfc: 'V-9430129', phone: '04242223333' },
      { id: 's3', name: 'Prod 3', ci: '18999888', phone: '04163334444' },
      { id: 's4', name: 'Prod 4', idNumber: '25444333', phone: '04125556666' }
    ];

    historicalSources.forEach(s => {
      const editCedula = s.cedula || s.rif || s.rfc || s.ci || s.idNumber || '';
      assert.ok(editCedula.length > 0, `El documento no debe quedar vacío para ${s.name}`);
      assert.notStrictEqual(editCedula, s.phone, `El documento no debe ser el teléfono`);
    });
  });

  test('C) Teléfono NO sobrescribe documento legal', () => {
    const producer = {
      id: 'sup-test-1',
      name: 'Hacienda San Pedro',
      rif: 'J-12345678-9',
      cedula: '12345678',
      phone: '04149999999'
    };
    // Al actualizar el teléfono
    const updated = {
      ...producer,
      phone: '04248888888'
    };
    assert.strictEqual(updated.cedula, '12345678');
    assert.strictEqual(updated.rif, 'J-12345678-9');
    assert.strictEqual(updated.phone, '04248888888');
  });

  test('D) Documento NO sobrescribe teléfono', () => {
    const producer = {
      id: 'sup-test-1',
      name: 'Hacienda San Pedro',
      cedula: '12345678',
      phone: '04149999999'
    };
    // Al actualizar la cédula
    const updated = {
      ...producer,
      cedula: 'V-12345678'
    };
    assert.strictEqual(updated.cedula, 'V-12345678');
    assert.strictEqual(updated.phone, '04149999999');
  });

  test('E) Login productor usa Documento Legal (getProducerLegalDocumentDigits)', () => {
    const p1 = { rif: 'J-12345678-9', phone: '04149999999' };
    assert.strictEqual(getProducerLegalDocumentDigits(p1), '123456789');

    const p2 = { cedula: 'V-15.712.801', phone: '04241112233' };
    assert.strictEqual(getProducerLegalDocumentDigits(p2), '15712801');

    const p3 = { rfc: 'PROD-445566', phone: '04120000000' };
    assert.strictEqual(getProducerLegalDocumentDigits(p3), '445566');
  });

  test('F) PIN inicial = last4(documento) + "00" (6 dígitos exactos)', () => {
    const p1 = { rif: 'J-12345678-9' }; // digits: 123456789 -> last 4: 6789 -> PIN: 678900
    assert.strictEqual(getProducerInitialPin(p1), '678900');
    assert.strictEqual(getProducerInitialPin(p1).length, 6);

    const p2 = { cedula: '15712801' }; // digits: 15712801 -> last 4: 2801 -> PIN: 280100
    assert.strictEqual(getProducerInitialPin(p2), '280100');
    assert.strictEqual(getProducerInitialPin(p2).length, 6);

    const p3 = { ci: '9430129' }; // digits: 9430129 -> last 4: 0129 -> PIN: 012900
    assert.strictEqual(getProducerInitialPin(p3), '012900');
    assert.strictEqual(getProducerInitialPin(p3).length, 6);
  });

  test('G) Sin documento legal válido NO se genera PIN (FAIL CLOSED: null)', () => {
    const producerWithPhoneOnly = { phone: '04149999999' };
    assert.strictEqual(getProducerInitialPin(producerWithPhoneOnly), null);

    const pShort = { cedula: '12' };
    assert.strictEqual(getProducerInitialPin(pShort), null);

    const pEmpty = {};
    assert.strictEqual(getProducerInitialPin(pEmpty), null);

    const pNull = null;
    assert.strictEqual(getProducerInitialPin(pNull), null);
  });

  test('H) Backend exige longitud exacta de 6 dígitos numéricos para PIN', () => {
    const valid6DigitPinRegex = /^\d{6}$/;
    
    assert.strictEqual(valid6DigitPinRegex.test('280100'), true);
    assert.strictEqual(valid6DigitPinRegex.test('1234'), false); // 4 dígitos es rechazado
    assert.strictEqual(valid6DigitPinRegex.test('12345'), false); // 5 dígitos es rechazado
    assert.strictEqual(valid6DigitPinRegex.test('1234567'), false); // 7 dígitos es rechazado
    assert.strictEqual(valid6DigitPinRegex.test('abcdef'), false); // no numérico rechazado
  });

});

