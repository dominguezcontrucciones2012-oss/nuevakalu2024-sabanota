/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Transaction,
  UserIdentity,
  PaymentMethod,
  ActivityStream,
  RevenuePoint,
  CheeseProduct,
  CheeseLedgerBatch,
  ClientProfile,
  SupplierProfile,
  AccountBill,
  OperatingExpense,
  CustomerComplaint,
  BusinessSettings
} from './types';

export const INITIAL_TRANSACTIONS: Transaction[] = [];

export const INITIAL_USERS: UserIdentity[] = [];

export const INITIAL_PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'pm-1',
    type: 'card',
    title: 'Visa de Negocios Platino',
    detail: 'Visa terminada en 4242',
    isPrimary: true
  },
  {
    id: 'pm-2',
    type: 'paypal',
    title: 'Cuenta de Negocios PayPal',
    detail: 'conectado@email.com',
    isPrimary: false
  },
  {
    id: 'pm-3',
    type: 'crypto',
    title: 'Billetera Crypto Institucional',
    detail: 'BTC, ETH, USDC',
    isPrimary: false
  }
];

export const INITIAL_ACTIVITIES: ActivityStream[] = [];

export const REVENUE_CHART_DATA: RevenuePoint[] = [
  { label: '01 Oct', value: 85000 },
  { label: '05 Oct', value: 92000 },
  { label: '10 Oct', value: 110000 },
  { label: '15 Oct', value: 105000 },
  { label: '20 Oct', value: 125000 },
  { label: '25 Oct', value: 142890 }
];

import migratedData from './migrated_data.json';

if (!localStorage.getItem('kalu_inventory')) {
  localStorage.setItem('kalu_inventory', JSON.stringify(migratedData.products));
}
if (!localStorage.getItem('kalu_clients')) {
  localStorage.setItem('kalu_clients', JSON.stringify(migratedData.clients));
}

if (!localStorage.getItem('kalu_suppliers')) {
  localStorage.setItem('kalu_suppliers', JSON.stringify(migratedData.suppliers || []));
}

// Cheese-Specific Preloaded Data
export const INITIAL_CHEESE_PRODUCTS: CheeseProduct[] = JSON.parse(localStorage.getItem('kalu_inventory') || '[]');

export const INITIAL_CHEESE_BATCHES: CheeseLedgerBatch[] = [];

export const INITIAL_CLIENTS: ClientProfile[] = JSON.parse(localStorage.getItem('kalu_clients') || '[]');

const storedSuppliers = JSON.parse(localStorage.getItem('kalu_suppliers') || '[]');
export const INITIAL_SUPPLIERS: SupplierProfile[] = storedSuppliers.length > 0 ? storedSuppliers : (migratedData.suppliers || []);

export const INITIAL_BILLS: AccountBill[] = [];

export const INITIAL_OPERATING_EXPENSES: OperatingExpense[] = [];

export const INITIAL_COMPLAINTS: CustomerComplaint[] = [];

export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: 'Quesería KALU — Quesos Finos & Artesanales',
  taxId: 'KALU920512AB3',
  address: 'Avenida de la Constitución #1420, Barrio Alto',
  taxRate: 16.0,
  receiptFooter: '¡Gracias por apoyar el comercio local de Martín Niño y artesanos regionales!',
  printerConnected: true,
  backupInterval: 'daily',
  sabanotaInitials: {
    drawerUsd: 0,
    drawerBs: 0,
    bankBalanceBs: 0,
    bankBalanceUsd: 0,
    totalCapital: 0
  }
};

