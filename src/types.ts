/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Transaction {
  id: string;
  entity: string;
  category: 'cloud' | 'payment' | 'hardware' | 'deployment' | 'database' | 'ventas' | 'gastos' | 'compras' | 'credito' | 'ingresos_cobranza';
  date: string;
  timestamp?: any;
  invoiceNumber: string;
  amount: number;
  isIncome: boolean;
  status: 'Completado' | 'Pendiente' | 'pending_approval' | 'approved' | 'rejected' | 'pending_verification';
  clientId?: string;
  installmentIds?: string[];
  kaluCreditData?: {
    inicial: number;
    aFinanciar: number;
    cuotas: number;
  };
  clientCi?: string;
  totalUSD?: number;
  downPayment?: number;
  financedAmount?: number;
  installmentsCount?: number;
  paymentMethod?: string;
  notes?: string;
  items?: any[];
  addedPayments?: any[];
  changeAmount?: number;
  changeCurrency?: 'USD' | 'BS' | 'PAGO_MOVIL' | 'MIXED';
  changeReference?: string;
  mixedChange?: {
    usd: number;
    bs: number;
    mobile: number;
    mobileRef?: string;
  };
  changeBs?: number;
  bcvRateAtSettlement?: number;
  isVoided?: boolean;
  debtAmount?: number;
  createdAt?: number;
  isClosed?: boolean;
  closureId?: string;
}

export interface DebtInstallment {
  id: string;
  clientId: string;
  transactionId: string;
  amount: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue' | 'in_review';
  paidAt?: string;
  pointsEarned?: number;
  pointsAwarded?: boolean;
  timestamp?: any;
}

export interface UserIdentity {
  id: string;
  name: string;
  cedula: string;
  pin: string;
  initials: string;
  role: 'admin' | 'cajero' | 'auditor';
  active: boolean;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'paypal' | 'crypto' | 'cash' | 'transfer';
  title: string;
  detail: string;
  isPrimary: boolean;
}

export interface ActivityStream {
  id: string;
  title: string;
  detail: string;
  time: string;
  location: string;
  type: 'sale' | 'auth' | 'warning' | 'info';
  amount?: number;
}
export type ViewType = 'portal-dashboard' | 'pos-terminal' | 'access-control' | 'inventory' | 'kardex' | 'clients' | 'suppliers' | 'finances' | 'support' | 'settings' | 'mobile-portals' | 'contador-ia' | 'cheese-trips' | 'collections';
export interface MobileOrder {
  id: string;
  type: 'client' | 'supplier'; // client order for cheese OR supplier order for supplies/food (repuestos/comida)
  entityId: string; // client id or supplier id
  entityName: string;
  date: string;
  timestamp?: any;
  items: {
    productId: string;
    name: string;
    quantity: number;
    price: number;
    subtotal: number;
    unit?: 'Kg' | 'Lt' | 'Und';
  }[];
  total: number;
  paymentMethod: 'contado' | 'fiado'; // 'contado' (cash) or 'fiado' (credito/libreta de queso)
  status: 'Pendiente' | 'Entregado' | 'Cancelado';
}

export interface RevenuePoint {
  label: string;
  value: number;
}

// Cheese-specific ERP Interfaces
export interface CheeseProduct {
  id: string;
  name: string;
  category: 'Fresco' | 'Semicurado' | 'Curado' | 'Azul' | 'Especial' | 'Víveres';
  stockKg: number;
  purchasePrice: number; // Cost of purchase per kg
  sellingPrice: number;  // Sale price per kg
  alertThreshold: number; // Low stock trigger
  agingDays: number;     // Standard maturation time
  origin: string;        // E.g., Martin Niño
  unit?: 'Kg' | 'Lt' | 'Und';
  barcode?: string;
  barcodes?: string[];
  imageUrl?: string;
}

export interface KardexMovement {
  id: string;
  date: string;
  timestamp?: any;
  productId: string;
  productName: string;
  unit: 'Kg' | 'Lt' | 'Und';
  type: 'ENTRADA_COMPRA' | 'SALIDA_VENTA' | 'MERMA_DANO' | 'AJUSTE_MANUAL' | 'SALIDA_VIAJE' | 'ENTRADA_VIVERES';
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost: number;
  totalValue?: number;
  totalCost: number;
  referenceId?: string;
  notes?: string;
  userOrCashier?: string;
}

export interface CheeseLedgerBatch {
  id: string;
  productId: string;
  productName: string;
  receivedDate: string;
  initialWeightKg: number;
  currentWeightKg: number;
  shrinkageKg: number; // Weight lost during maturation (merma)
  status: 'Madurando' | 'Listo' | 'Agotado';
  unit?: 'Kg' | 'Lt' | 'Und';
}

export interface CheeseSaleItem {
  productId: string;
  name: string;
  quantityKg: number;
  pricePerKg: number;
  subtotal: number;
  unit?: 'Kg' | 'Lt' | 'Und';
}

export interface ClientProfile {
  id: string;
  name: string;
  cedula?: string;
  rfc?: string;
  ci?: string;
  ciRif?: string;
  idNumber?: string;
  phone: string;
  email: string;
  address?: string;
  birthday?: string;
  pin?: string;
  tier: 'Bronce' | 'Plata' | 'Oro' | 'VIP';
  loyaltyPoints: number;
  outstandingDebt: number;
}

export interface SupplierProfile {
  id: string;
  name: string;
  idNumber?: string;
  cedula?: string;
  contact: string;
  phone: string;
  email: string;
  balanceOwed: number; // Accounts Payable sum (what we owe them for cheese)
  storeDebt?: number;  // Accounts Receivable sum (what they owe us for store supplies/food)
  contactName?: string;
  address?: string;
  productsSupplied?: string[];
  rfc?: string;
  birthday?: string;
  pin?: string;
  isCheeseProducer?: boolean;
  isEmployee?: boolean;
}

export interface AccountBill {
  id: string;
  type: 'receivable' | 'payable'; // receivable = client owes us, payable = we owe supplier
  entityId: string; // clientId or supplierId
  entityName: string;
  amount: number;
  dueDate: string;
  status: 'Pendiente' | 'Pagado';
  notes?: string;
}

export interface OperatingExpense {
  id: string;
  date: string;
  category: 'Alquiler' | 'Luz y Agua' | 'Publicidad' | 'Nóminas' | 'Transporte' | 'Mantenimiento' | 'Otros';
  description: string;
  amount: number;
  paymentMethod: 'Efectivo' | 'Tarjeta' | 'Transferencia';
}

export interface CustomerComplaint {
  id: string;
  clientName: string;
  phone: string;
  date: string;
  timestamp?: any;
  category: 'Calidad' | 'Atención' | 'Precio' | 'Otros';
  description: string;
  status: 'Pendiente' | 'Resuelto';
  resolutionNotes?: string;
}

export interface BusinessSettings {
  businessName: string;
  exchangeRate?: number;
  lastRateSync?: string;
  taxId: string; // RFC
  address: string;
  taxRate: number; // IVA percentage
  receiptFooter: string;
  printerConnected: boolean;
  backupInterval: 'daily' | 'weekly' | 'manual';
  defaultStartingCash?: number;
  emergencyAlertMode?: boolean;
  sabanotaInitials?: {
    drawerUsd: number;
    drawerBs: number;
    bankBalanceBs: number;
    bankBalanceUsd: number;
    totalCapital: number;
  };
  centralVaultBalance?: CentralVaultBalance;
}

export interface CentralVaultBalance {
  usd: number;
  bs: number;
  bankBs: number;
  bankUsd: number;
}

export interface TripInvoiceItem {
  description: string;
  quantity: number;
  unitCostUsd: number;
  totalCostUsd: number;
}

export interface TripInvoice {
  id: string;
  supplierName: string;
  invoiceNumber?: string;
  date: string;
  totalUsd: number;
  items: TripInvoiceItem[];
  receiptImageUrl?: string;
  isMerchandiseReturn?: boolean; // If true, this invoice represents goods brought back (Víveres)
}

export interface CheeseTrip {
  id: string;
  tripNumber: number;
  date: string;
  destination: string;
  clientId?: string;
  clientName?: string;
  driverOrResponsible: string;
  status: 'en_ruta' | 'liquidado';
  cheeseProductId: string;
  cheeseProductName: string;
  dispatchedKg: number;
  costPerKgUsd: number;
  dispatchedCostValue: number;
  cashTakenUsd?: number;
  cashTakenBs?: number;
  totalBagValueUsd?: number;
  invoices: TripInvoice[];
  totalInvoicesValueUsd: number;
  cashReturnedUsd: number;
  cashReturnedBs: number;
  bankReturnedBs: number;
  bankReturnedUsd: number;
  bcvRateAtSettlement: number;
  totalSettlementValueUsd: number;
  netProfitUsd: number;
  notes?: string;
  settledAt?: string;
  createdAt: string;
}