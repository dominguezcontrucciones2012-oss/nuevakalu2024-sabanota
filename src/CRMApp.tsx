import React, { useState, useEffect } from 'react';
import {
  Transaction,
  UserIdentity,
  PaymentMethod,
  ActivityStream,
  CheeseProduct,
  CheeseLedgerBatch,
  ClientProfile,
  SupplierProfile,
  AccountBill,
  OperatingExpense,
  CustomerComplaint,
  BusinessSettings,
  ViewType,
  MobileOrder,
  RevenuePoint,
  KardexMovement,
  CheeseTrip,
  CentralVaultBalance,
  AdminAccountEntry
} from './types';

import {
  INITIAL_TRANSACTIONS,
  INITIAL_USERS,
  INITIAL_PAYMENT_METHODS,
  INITIAL_ACTIVITIES,
  INITIAL_CHEESE_PRODUCTS,
  INITIAL_CHEESE_BATCHES,
  INITIAL_CLIENTS,
  INITIAL_SUPPLIERS,
  INITIAL_BILLS,
  INITIAL_OPERATING_EXPENSES,
  INITIAL_COMPLAINTS,
  DEFAULT_SETTINGS
} from './data';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LoginView from './components/LoginView';
import DashboardView from './components/DashboardView';
import { fetchCurrentUserApi, logoutApi } from './services/localApi';

// New specialized ERP Views
import CheesePOSView from './components/CheesePOSView';
import CheeseInventoryView from './components/CheeseInventoryView';
import { PurchaseItem } from './components/StockPurchasesView';
import KardexView from './components/KardexView';
import CheeseTripsView from './components/CheeseTripsView';
import ClientsCreditView from './components/ClientsCreditView';
import SuppliersDebtsView from './components/SuppliersDebtsView';
import FinancesAnalysisView from './components/FinancesAnalysisView';
import SettingsAdminView from './components/SettingsAdminView';
import AccessControlView from './components/AccessControlView';
import ComplaintBoxView from './components/ComplaintBoxView';
import StockPurchasesView from './components/StockPurchasesView';
import ContadorIAView from './components/ContadorIAView';
import CollectionsView from './components/contador/CollectionsView';

import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { 
  onCollectionSnapshot, 
  addLocalDoc, 
  updateLocalDoc, 
  deleteLocalDoc, 
  fetchCollection,
  processSaleAtomic,
  initSocket
} from './services/localApi';
import { fetchLocalProducts, updateLocalProduct, addLocalProduct, deleteLocalProduct } from './services/productApi';
import { fetchOfficialBcvRate } from './services/exchangeRateService';
import { getUnitLabel } from './utils';

interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning';
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserIdentity | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  useEffect(() => {
    fetchCurrentUserApi()
      .then((user) => {
        if (user) {
          setIsAuthenticated(true);
          setCurrentUser(user);
        } else {
          setIsAuthenticated(false);
          setCurrentUser(null);
          localStorage.removeItem('kalu_auth_state');
          localStorage.removeItem('kalu_current_user');
        }
      })
      .catch(() => {
        setIsAuthenticated(false);
        setCurrentUser(null);
      })
      .finally(() => {
        setIsAuthChecking(false);
      });
  }, []);
  const [currentView, setCurrentView] = useState<ViewType>('portal-dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);

  // Unified States for Cheese ERP
  const [cheeseProducts, setCheeseProducts] = useState<CheeseProduct[]>(() => {
    const saved = localStorage.getItem('kalu_inventory');
    return saved ? JSON.parse(saved) : INITIAL_CHEESE_PRODUCTS;
  });
  const [cheeseBatches, setCheeseBatches] = useState<CheeseLedgerBatch[]>(() => {
    const saved = localStorage.getItem('kalu_batches');
    return saved ? JSON.parse(saved) : INITIAL_CHEESE_BATCHES;
  });
  const [clients, setClients] = useState<ClientProfile[]>(() => {
    const saved = localStorage.getItem('kalu_clients');
    return saved ? JSON.parse(saved) : INITIAL_CLIENTS;
  });
  const [suppliers, setSuppliers] = useState<SupplierProfile[]>(() => {
    const saved = localStorage.getItem('kalu_suppliers');
    return saved ? JSON.parse(saved) : INITIAL_SUPPLIERS;
  });
  const [bills, setBills] = useState<AccountBill[]>(() => {
    const saved = localStorage.getItem('kalu_supplier_ledger'); // Using kalu_supplier_ledger for bills
    return saved ? JSON.parse(saved) : INITIAL_BILLS;
  });
  const [expenses, setExpenses] = useState<OperatingExpense[]>(() => {
    const saved = localStorage.getItem('kalu_expenses');
    return saved ? JSON.parse(saved) : INITIAL_OPERATING_EXPENSES;
  });
  const [complaints, setComplaints] = useState<CustomerComplaint[]>(INITIAL_COMPLAINTS);
  const [mobileOrders, setMobileOrders] = useState<MobileOrder[]>([]);
  const [settings, setSettings] = useState<BusinessSettings>(() => {
    try {
      const saved = localStorage.getItem('kalu_settings');
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [cheeseTrips, setCheeseTrips] = useState<CheeseTrip[]>(() => {
    const saved = localStorage.getItem('kalu_cheese_trips');
    return saved ? JSON.parse(saved) : [];
  });
  // Global Ledger States
  const [transactions, setTransactions] = useState<Transaction[]>(() => INITIAL_TRANSACTIONS);
  const [users, setUsers] = useState<UserIdentity[]>(() => {
    try {
      const saved = localStorage.getItem('kalu_users');
      return saved ? JSON.parse(saved) : INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  });
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(INITIAL_PAYMENT_METHODS);
  const [activities, setActivities] = useState<ActivityStream[]>(() => []);

  // Toast stack
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Finanzas consolidadas: centralVaultBalance ahora reside en settings.centralVaultBalance
  const [balance, setBalance] = useState<number>(0);
  const [totalSalesCount, setTotalSalesCount] = useState<number>(0);
  const [totalSalesRevenue, setTotalSalesRevenue] = useState<number>(0);

  // Real-time Local API Listeners -> Local Listeners
  useEffect(() => {
    fetchLocalProducts().then(data => {
      if (data && data.length) setCheeseProducts(data);
    }).catch(e => console.error("Error loading local products:", e));

    const unsubProducts = onCollectionSnapshot('products', (data) => {
      if (Array.isArray(data)) {
        setCheeseProducts(data as CheeseProduct[]);
      }
    });

    const unsubTransactions = onCollectionSnapshot('transactions', (data) => {
      if (Array.isArray(data)) {
        const txs = [...(data as Transaction[])];
        txs.sort((a, b) => {
          if (a.id > b.id) return -1;
          if (a.id < b.id) return 1;
          return 0;
        });
        setTransactions(txs);
        localStorage.setItem('kalu_sales_history', JSON.stringify(txs));
      }
    });

    const unsubClients = onCollectionSnapshot('clients', (data) => {
      if (Array.isArray(data)) {
        setClients(data as ClientProfile[]);
      }
    });

    const unsubCheeseTrips = onCollectionSnapshot('cheeseTrips', (data) => {
      if (Array.isArray(data)) {
        const trips = [...(data as CheeseTrip[])];
        trips.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setCheeseTrips(trips);
      }
    });

    const unsubSuppliers = onCollectionSnapshot('suppliers', (data) => {
      if (Array.isArray(data)) {
        setSuppliers(data as SupplierProfile[]);
      }
    });

    const unsubSettings = onCollectionSnapshot('settings', (data) => {
      const generalDoc = data.find((d: any) => d.id === 'general');
      if (generalDoc) {
        let newSettings = { ...DEFAULT_SETTINGS, ...generalDoc } as BusinessSettings;
        
        // MIGRATION LOGIC: If centralVaultBalance is empty but we have sabanotaInitials
        if (!generalDoc.centralVaultBalance && generalDoc.sabanotaInitials) {
          newSettings.centralVaultBalance = {
            usd: Number(generalDoc.sabanotaInitials.drawerUsd) || 0,
            bs: Number(generalDoc.sabanotaInitials.drawerBs) || 0,
            bankBs: Number(generalDoc.sabanotaInitials.bankBalanceBs) || 0,
            bankUsd: Number(generalDoc.sabanotaInitials.bankBalanceUsd) || 0
          };
        }
        setSettings(newSettings);
        try {
          localStorage.setItem('kalu_settings', JSON.stringify(newSettings));
        } catch (e) {
          // ignore
        }
      }
    });

    const unsubUsers = onCollectionSnapshot('users', (data) => {
      setUsers(data as UserIdentity[]);
    });

    const unsubMobileOrders = onCollectionSnapshot('mobileOrders', (data) => {
      setMobileOrders(data as MobileOrder[]);
    });

    return () => {
      unsubProducts();
      unsubTransactions();
      unsubClients();
      unsubSuppliers();
      unsubSettings();
      unsubUsers();
      unsubCheeseTrips();
      unsubMobileOrders();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('kalu_inventory', JSON.stringify(cheeseProducts));
  }, [cheeseProducts]);

  useEffect(() => {
    localStorage.setItem('kalu_clients', JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    localStorage.setItem('kalu_suppliers', JSON.stringify(suppliers));
  }, [suppliers]);

  useEffect(() => {
    localStorage.setItem('kalu_supplier_ledger', JSON.stringify(bills));
  }, [bills]);

  useEffect(() => {
    localStorage.setItem('kalu_sales_history', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('kalu_activities', JSON.stringify(activities));
  }, [activities]);

  useEffect(() => {
    localStorage.setItem('kalu_balance', balance.toString());
  }, [balance]);

  useEffect(() => {
    localStorage.setItem('kalu_sales_count', totalSalesCount.toString());
  }, [totalSalesCount]);

  useEffect(() => {
    localStorage.setItem('kalu_sales_revenue', totalSalesRevenue.toString());
  }, [totalSalesRevenue]);

  useEffect(() => {
    localStorage.setItem('kalu_batches', JSON.stringify(cheeseBatches));
  }, [cheeseBatches]);

  useEffect(() => {
    localStorage.setItem('kalu_expenses', JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    localStorage.setItem('kalu_cheese_trips', JSON.stringify(cheeseTrips));
  }, [cheeseTrips]);

  useEffect(() => {
    localStorage.setItem('kalu_users', JSON.stringify(users));
  }, [users]);

  // Help alert helper
  const addNotification = (message: string, type: 'success' | 'info' | 'warning' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-diminish after 4s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };



  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleLoginSuccess = (user: UserIdentity, targetView?: ViewType) => {
    setIsAuthenticated(true);
    setCurrentUser(user);
    if (targetView) {
      setCurrentView(targetView);
    } else {
      setCurrentView('pos-terminal');
    }
  };

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch (e) {
      console.warn('Error during logout:', e);
    }
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentView('portal-dashboard');
    localStorage.removeItem('kalu_auth_state');
    localStorage.removeItem('kalu_current_user');
  };

  // ERP STATE MODIFIERS

  // 1. Point of sale (Procesar Venta Atómica)
  const handleProcessSale = async (
    saleItems: any[],
    clientId?: string,
    paymentMethodType?: string,
    supplierId?: string,
    paidAmount?: number,
    saleTotalAmount?: number,
    addedPayments?: any[],
    changeAmount?: number,
    changeCurrency?: string,
    changeReference?: string,
    mixedChange?: any,
    changeBs?: number,
    bcvRateAtSettlement?: number
  ) => {
    const saleTotal = saleTotalAmount !== undefined ? saleTotalAmount : saleItems.reduce((sum, item) => sum + item.subtotal, 0);
    const amountPaid = paidAmount !== undefined ? paidAmount : saleTotal;
    const debtAmount = Math.max(0, saleTotal - amountPaid);

    let customerName = 'Cliente de Mostrador';
    if (clientId) {
      const selectedClient = clients.find(c => c.id === clientId);
      if (selectedClient) customerName = selectedClient.name;
    } else if (supplierId) {
      const selectedSup = suppliers.find(s => s.id === supplierId);
      if (selectedSup) customerName = `${selectedSup.name} (Productor)`;
    }

    // Determine the precise payment method string
    let finalPaymentMethod = paymentMethodType || 'Efectivo';
    if (debtAmount > 0 && paidAmount === 0) {
      finalPaymentMethod = supplierId ? 'Libreta Quesero' : 'Crédito / Fiado';
    } else if (debtAmount > 0 && paidAmount! > 0) {
      finalPaymentMethod = `Multipago (Efectivo + ${supplierId ? 'Libreta' : 'Crédito'})`;
    }

    const newTxId = `TX-${Date.now()}`;
    const newTx: Transaction = {
      id: newTxId,
      entity: customerName,
      clientId: clientId || null,
      debtAmount: debtAmount,
      createdAt: Date.now(),
      category: 'ventas',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: `F-${Math.floor(Math.random() * 9000 + 1000)}`,
      amount: saleTotal,
      isIncome: true,
      status: 'Completado',
      paymentMethod: finalPaymentMethod,
      items: saleItems,
      addedPayments: addedPayments || [],
      changeAmount: changeAmount || 0,
      changeCurrency: (changeCurrency as 'USD' | 'BS' | 'PAGO_MOVIL' | 'MIXED') || 'USD',
      changeReference: changeReference || '',
      mixedChange: mixedChange || null,
      changeBs: changeBs || 0,
      bcvRateAtSettlement: bcvRateAtSettlement || settings.exchangeRate || 42.50
    };

    // Calculate vault delta
    const currentVault = settings?.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };
    let deltaUsd = 0;
    let deltaBs = 0;
    let deltaBankBs = 0;
    let deltaBankUsd = 0;
    const rate = bcvRateAtSettlement || settings.exchangeRate || 42.5;

    if (addedPayments && Array.isArray(addedPayments) && addedPayments.length > 0) {
      addedPayments.forEach((p: any) => {
        const m = (p.method || '').toLowerCase().trim();
        const amt = Number(p.amount) || 0;
        const orig = Number(p.originalAmount) || 0;

        if (m.includes('efectivo') && (m.includes('$') || m.includes('usd') || (!m.includes('bs') && !m.includes('ves')))) {
          deltaUsd += amt;
        } else if (m.includes('efectivo') && (m.includes('bs') || m.includes('ves'))) {
          deltaBs += orig || (amt * rate);
        } else if (m.includes('movil') || m.includes('móvil') || m.includes('transfer') || m.includes('tarjeta') || m.includes('punto') || m.includes('bio') || m.includes('banco bs') || p.currency === 'Bs' || p.currency === 'VES') {
          deltaBankBs += orig || (amt * rate);
        } else if (m.includes('zelle') || m.includes('banco usd') || m.includes('binance') || m.includes('dolar') || m.includes('usd') || p.currency === 'USD') {
          deltaBankUsd += amt;
        } else {
          deltaBankBs += orig || (amt * rate);
        }
      });
    } else {
      const pm = (paymentMethodType || 'Efectivo').toLowerCase().trim();
      if (pm.includes('efectivo') && (pm.includes('$') || pm.includes('usd') || (!pm.includes('bs') && !pm.includes('ves')))) {
        deltaUsd += amountPaid;
      } else if (pm.includes('efectivo') && (pm.includes('bs') || pm.includes('ves'))) {
        deltaBs += amountPaid * rate;
      } else if (pm.includes('movil') || pm.includes('móvil') || pm.includes('transfer') || pm.includes('tarjeta') || pm.includes('punto') || pm.includes('bio')) {
        deltaBankBs += amountPaid * rate;
      } else if (pm.includes('zelle') || pm.includes('banco usd') || pm.includes('binance')) {
        deltaBankUsd += amountPaid;
      } else if (!pm.includes('crédito') && !pm.includes('fiado') && !pm.includes('libreta')) {
        deltaUsd += amountPaid;
      }
    }

    if (changeAmount && changeAmount > 0) {
      if (changeCurrency === 'USD') {
        deltaUsd -= changeAmount;
      } else if (changeCurrency === 'BS' || changeCurrency === 'PAGO_MOVIL') {
        deltaBs -= (changeBs || (changeAmount * rate));
      } else if (changeCurrency === 'MIXED' && mixedChange) {
        deltaUsd -= (Number(mixedChange.usd) || 0);
        deltaBs -= (Number(mixedChange.bs) || 0);
        deltaBankBs -= (Number(mixedChange.mobile) || 0);
      } else {
        deltaUsd -= changeAmount;
      }
    }

    const updatedVault = {
      usd: currentVault.usd + deltaUsd,
      bs: currentVault.bs + deltaBs,
      bankBs: currentVault.bankBs + deltaBankBs,
      bankUsd: currentVault.bankUsd + deltaBankUsd
    };

    // Construct clean payload for backend atomic transaction
    const salePayload = {
      saleItems,
      clientId,
      customerName,
      supplierId,
      paidAmount: amountPaid,
      saleTotalAmount: saleTotal,
      debtAmount,
      addedPayments: addedPayments || [],
      paymentMethodType: finalPaymentMethod,
      changeAmount: changeAmount || 0,
      changeCurrency: changeCurrency || 'USD',
      changeReference: changeReference || '',
      mixedChange: mixedChange || null,
      changeBs: changeBs || 0,
      bcvRateAtSettlement: bcvRateAtSettlement || settings.exchangeRate || 42.50,
      transaction: newTx,
      updatedVaultBalance: updatedVault
    };

    // Backup state for atomic rollback
    const prevProductsState = cheeseProducts;
    const prevClientsState = clients;
    const prevSuppliersState = suppliers;
    const prevTransactionsState = transactions;
    const prevVaultState = settings?.centralVaultBalance;
    const prevBalance = balance;
    const prevSalesRevenue = totalSalesRevenue;
    const prevSalesCount = totalSalesCount;

    // Optimistic UI state updates
    setCheeseProducts((prevProducts) =>
      prevProducts.map((p) => {
        const item = saleItems.find((si) => si.productId === p.id);
        if (item) {
          return { ...p, stockKg: Math.max(0, p.stockKg - item.quantityKg) };
        }
        return p;
      })
    );

    if (clientId) {
      setClients((prevClients) =>
        prevClients.map((c) => {
          if (c.id === clientId) {
            return {
              ...c,
              outstandingDebt: Number(c.outstandingDebt || 0) + debtAmount,
              loyaltyPoints: Number(c.loyaltyPoints || 0) + Math.round(Number(amountPaid || 0))
            };
          }
          return c;
        })
      );
    } else if (supplierId) {
      setSuppliers((prevSuppliers) =>
        prevSuppliers.map((s) => {
          if (s.id === supplierId) {
            const currentBalanceOwed = Number(s.balanceOwed || 0);
            let newBalanceOwed = currentBalanceOwed;
            let newStoreDebt = Number(s.storeDebt || 0);
            if (currentBalanceOwed > 0) {
              if (currentBalanceOwed >= debtAmount) {
                newBalanceOwed = currentBalanceOwed - debtAmount;
              } else {
                newStoreDebt = newStoreDebt + (debtAmount - currentBalanceOwed);
                newBalanceOwed = 0;
              }
            } else {
              newStoreDebt = newStoreDebt + debtAmount;
            }
            return { ...s, storeDebt: newStoreDebt, balanceOwed: newBalanceOwed };
          }
          return s;
        })
      );
    }

    setBalance((prev) => prev + amountPaid);
    setTotalSalesRevenue((prev) => prev + saleTotal);
    setTotalSalesCount((prev) => prev + 1);
    setTransactions((prev) => [newTx, ...prev.filter(t => t.id !== newTx.id)]);
    setSettings((prev: any) => ({ ...prev, centralVaultBalance: updatedVault }));

    // Activity Stream
    const newAct: ActivityStream = {
      id: `act-${Date.now()}`,
      title: 'Venta Procesada (POS)',
      detail: `Se vendió a ${customerName}: ${saleItems.length} artículos por $${saleTotal.toFixed(2)} M.N. (Pagado: $${amountPaid.toFixed(2)}, Libreta: $${debtAmount.toFixed(2)})`,
      time: 'Ahora mismo',
      location: 'Matriz Principal',
      type: 'sale',
      amount: saleTotal
    };
    setActivities((prev) => [newAct, ...prev]);

    // Send single atomic request to server with rollback support
    try {
      await processSaleAtomic(salePayload);
    } catch (err: any) {
      console.error("[ROLLBACK] Error crítico al procesar venta atómica en servidor:", err);
      // Rollback optimistic state
      setCheeseProducts(prevProductsState);
      setClients(prevClientsState);
      setSuppliers(prevSuppliersState);
      setTransactions(prevTransactionsState);
      setBalance(prevBalance);
      setTotalSalesRevenue(prevSalesRevenue);
      setTotalSalesCount(prevSalesCount);
      if (prevVaultState) {
        setSettings((prev: any) => ({ ...prev, centralVaultBalance: prevVaultState }));
      }
      addNotification(`ERROR CRÍTICO: La transacción fue cancelada y revertida (Rollback). ${err?.message || ''}`, 'warning');
      throw err;
    }
  };

  const handleVoidSale = async (transactionId: string, items: any[]) => {
    // 1. Mark as voided in State
    setTransactions(prev => prev.map(t => t.id === transactionId ? { ...t, isVoided: true } : t));

    // 2. Mark as voided in Local API
    try {
      await updateLocalDoc('transactions', transactionId, { isVoided: true });
    } catch (e) {
      console.error('Failed to void transaction', e);
    }

    const tx = transactions.find(t => t.id === transactionId);
    const saleItems = (items && items.length > 0) ? items : (tx?.items || []);

    // 3. Return stock to inventory & register in Kardex (item por ítem de forma síncrona y segura)
    for (const item of saleItems) {
      const prodId = item.productId || item.id;
      const returnQty = Number(item.quantityKg ?? item.quantity ?? item.qty ?? 0);
      if (!prodId || returnQty <= 0) continue;

      const p = cheeseProducts.find(prod => String(prod.id) === String(prodId));
      if (p) {
        const previousStock = Number(p.stockKg || 0);
        const newStock = previousStock + returnQty;

        // Actualizar en el estado React
        setCheeseProducts(prev => prev.map(prod => String(prod.id) === String(prodId) ? { ...prod, stockKg: newStock } : prod));

        // Actualizar en la base de datos local
        try {
          await updateLocalDoc('products', String(prodId), { stockKg: newStock });
        } catch (e) {
          console.error(`Failed to return stock for product ${prodId}:`, e);
        }

        // Generar y persistir registro oficial en Kardex
        const unitCost = p.wholesalePrice || p.purchasePrice || p.pricePerKg || 0;
        const kardexMovement: KardexMovement = {
          id: crypto.randomUUID(),
          date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
          timestamp: Date.now(),
          productId: p.id,
          productName: p.name || item.productName || item.name || 'Producto',
          unit: (getUnitLabel(p) as any) || 'Und',
          type: 'ENTRADA_COMPRA',
          quantity: returnQty,
          previousStock: previousStock,
          newStock: newStock,
          unitCost: unitCost,
          totalCost: returnQty * unitCost,
          totalValue: Number(item.subtotal || item.total || (returnQty * (p.pricePerKg || p.price || 0))),
          referenceId: tx?.invoiceNumber || transactionId,
          notes: `Entrada por anulación de venta ${tx?.invoiceNumber ? '#' + tx.invoiceNumber : transactionId}`,
          userOrCashier: 'Caja'
        };

        try {
          await addLocalDoc('kardex', kardexMovement);
        } catch (e) {
          console.error("Error saving kardex movement for voided sale:", e);
        }
      }
    }

    // 4. Update financials & vault
    if (tx) {
      setBalance(prev => prev - (tx.amount || 0));
      setTotalSalesRevenue(prev => prev - (tx.amount || 0));
      setTotalSalesCount(prev => prev - 1);
      
      const currentVault = settings?.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };
      const pm = (tx.paymentMethod || '').toLowerCase();
      let newVault = { ...currentVault };
      if (pm.includes('bs') || pm.includes('ves')) {
        newVault.bs -= ((tx.amount || 0) * (tx.bcvRateAtSettlement || settings.exchangeRate || 42.5));
      } else if (pm.includes('movil') || pm.includes('transfer') || pm.includes('tarjeta') || pm.includes('punto')) {
        newVault.bankBs -= ((tx.amount || 0) * (tx.bcvRateAtSettlement || settings.exchangeRate || 42.5));
      } else {
        newVault.usd -= (tx.amount || 0);
      }
      handleUpdateSettings({ centralVaultBalance: newVault });

      const newAct: ActivityStream = {
        id: `act-void-${Date.now()}`,
        title: 'Venta Anulada',
        detail: `Se anuló la transacción ${tx.invoiceNumber || transactionId} por $${(tx.amount || 0).toFixed(2)}`,
        time: 'Ahora mismo',
        location: 'Matriz Principal',
        type: 'sale',
        amount: -(tx.amount || 0)
      };
      setActivities((prev) => [newAct, ...prev]);
    }
  };

  const handleRecordStockAdjustment = async (productId: string, newStockOrDelta: number, type: 'MERMA_DANO' | 'AJUSTE_MANUAL', reason: string) => {
    const prod = cheeseProducts.find(p => p.id === productId);
    if (!prod) return;

    const previousStock = prod.stockKg;
    const isAbsolute = type === 'AJUSTE_MANUAL'; // Let's assume AJUSTE_MANUAL provides the exact new stock, MERMA provides a delta (negative)
    const newStock = isAbsolute ? newStockOrDelta : Math.max(0, previousStock + newStockOrDelta);
    const quantityDiff = Math.abs(newStock - previousStock);
    const delta = newStock - previousStock;

    if (quantityDiff === 0) return;

    try {
      await updateLocalDoc('products', prod.id, {
        stockKg: (cheeseProducts.find(p => p.id === prod.id)?.stockKg || 0) + delta
      });

      const kardexMovement: KardexMovement = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        productId: prod.id,
        productName: prod.name,
        unit: (getUnitLabel(prod) as any) || 'Und',
        type: type,
        quantity: quantityDiff,
        previousStock: previousStock,
        newStock: newStock,
        unitCost: prod.purchasePrice || 0,
        totalCost: (prod.purchasePrice || 0) * quantityDiff,
        notes: reason,
        userOrCashier: 'Admin'
      };
      await addLocalDoc('kardex', kardexMovement);

      setCheeseProducts((prev) => prev.map(p => p.id === productId ? { ...p, stockKg: newStock } : p));
      addNotification('Ajuste de inventario y Kardex guardados con éxito', 'success');
    } catch (err) {
      console.error('Error saving adjustment:', err);
      addNotification('Error al guardar el ajuste de inventario', 'warning');
    }
  };

  // --- Viajes San Juan Handlers ---
  const handleCreateTrip = async (trip: Omit<CheeseTrip, 'id'>) => {
    try {
      const newTrip: CheeseTrip = { ...trip, id: crypto.randomUUID() };
      await addLocalDoc('cheeseTrips', newTrip);

      // Descontar inventario
      const prod = cheeseProducts.find(p => p.id === trip.cheeseProductId);
      if (prod) {
        await updateLocalDoc('products', prod.id, {
          stockKg: (cheeseProducts.find(p => p.id === prod.id)?.stockKg || 0) - trip.dispatchedKg
        });

        // Registrar en Kardex
        const kardexMovement: KardexMovement = {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          productId: prod.id,
          productName: prod.name,
          unit: (getUnitLabel(prod) as any) || 'Kg',
          type: 'SALIDA_VIAJE',
          quantity: trip.dispatchedKg,
          previousStock: prod.stockKg,
          newStock: prod.stockKg - trip.dispatchedKg,
          unitCost: prod.purchasePrice || 0,
          totalCost: (prod.purchasePrice || 0) * trip.dispatchedKg,
          notes: `Viaje San Juan #${trip.tripNumber} a ${trip.destination}`,
          userOrCashier: 'Admin'
        };
        await addLocalDoc('kardex', kardexMovement);
      }
      
      // Assign debt to client if selected
      if (trip.clientId) {
        const client = clients.find(c => c.id === trip.clientId);
        if (client) {
          await updateLocalDoc('clients', client.id, {
            outstandingDebt: (clients.find(c => c.id === client.id)?.outstandingDebt || 0) + trip.dispatchedCostValue
          });
        }
      }

      // INYECCIÓN CONTABLE A LA FICHA DE LA ADMINISTRADORA (DEBE / CARGO)
      const currentRate = settings.exchangeRate || 45;
      const bankUsdEquiv = (trip.bankTakenUsd || 0) + ((trip.bankTakenBs || 0) / currentRate);
      const cashUsdEquiv = (trip.cashTakenUsd || 0) + ((trip.cashTakenBs || 0) / currentRate);
      const totalBagUsd = trip.totalBagValueUsd || (trip.dispatchedCostValue + cashUsdEquiv + bankUsdEquiv);
      
      const adminEntry: AdminAccountEntry = {
        id: `LEDGER-GIRA-${Date.now()}`,
        date: new Date().toISOString(),
        timestamp: Date.now(),
        adminName: trip.driverOrResponsible || 'Daisy Corro',
        type: 'FONDEO_GIRA',
        concept: `Salida Gira San Juan #${trip.tripNumber} (${trip.dispatchedKg}Kg Queso + Efectivo + Banco)`,
        category: 'Gira San Juan',
        amountUsd: (trip.cashTakenUsd || 0) + (trip.bankTakenUsd || 0) + trip.dispatchedCostValue,
        amountBs: (trip.cashTakenBs || 0) + (trip.bankTakenBs || 0),
        exchangeRateAtDate: currentRate,
        debitUsd: totalBagUsd,
        creditUsd: 0,
        balanceAfterUsd: totalBagUsd,
        referenceId: newTrip.id,
        status: 'conciliado',
        createdAt: new Date().toISOString()
      };
      await addLocalDoc('adminLedger', adminEntry);

      addNotification('Viaje San Juan registrado e inyectado a la Ficha Administradora', 'success');
    } catch (err) {
      console.error('Error creating trip:', err);
      addNotification('Error al registrar el viaje', 'warning');
    }
  };

  const handleUpdateTrip = async (tripId: string, updates: Partial<CheeseTrip>) => {
    try {
      await updateLocalDoc('cheeseTrips', tripId, updates);
      addNotification('Viaje actualizado', 'success');
    } catch (err) {
      console.error('Error updating trip:', err);
      addNotification('Error al actualizar el viaje', 'warning');
    }
  };

  const handleSettleTrip = async (tripId: string, settlementData: Partial<CheeseTrip>) => {
    try {
      await updateLocalDoc('cheeseTrips', tripId, {
        ...settlementData,
        status: 'liquidado',
        settledAt: new Date().toISOString()
      });

      const trip = cheeseTrips.find(t => t.id === tripId);
      if (trip && trip.clientId && settlementData.totalSettlementValueUsd) {
        await updateLocalDoc('clients', trip.clientId, {
          outstandingDebt: (clients.find(c => c.id === trip.clientId)?.outstandingDebt || 0) - (settlementData.totalSettlementValueUsd || 0)
        });
      }

      // INYECCIÓN CONTABLE DE LIQUIDACIÓN A LA FICHA DE LA ADMINISTRADORA (HABER / DESCARGO)
      const currentRate = settlementData.bcvRateAtSettlement || settings.exchangeRate || 45;
      const totalSettledUsd = settlementData.totalSettlementValueUsd || 0;
      
      const adminSettleEntry: AdminAccountEntry = {
        id: `LEDGER-SETTLE-${Date.now()}`,
        date: new Date().toISOString(),
        timestamp: Date.now(),
        adminName: trip?.driverOrResponsible || 'Daisy Corro',
        type: 'LIQUIDACION_GIRA',
        concept: `Liquidación & Cierre Gira San Juan #${trip?.tripNumber || ''} (Facturas + Retorno Efectivo)`,
        category: 'Gira San Juan',
        amountUsd: totalSettledUsd,
        amountBs: (settlementData.cashReturnedBs || 0) + (settlementData.bankReturnedBs || 0),
        exchangeRateAtDate: currentRate,
        debitUsd: 0,
        creditUsd: totalSettledUsd,
        balanceAfterUsd: 0,
        referenceId: tripId,
        status: 'conciliado',
        createdAt: new Date().toISOString()
      };
      await addLocalDoc('adminLedger', adminSettleEntry);

      addNotification('Viaje liquidado y cuenta de administradora conciliada', 'success');
    } catch (err) {
      console.error('Error settling trip:', err);
      addNotification('Error al liquidar el viaje', 'warning');
    }
  };


  // Mobile Orders Handlers
  const handleAddMobileOrder = (order: MobileOrder) => {
    setMobileOrders((prev) => [order, ...prev]);

    // Log as activity
    const newAct: ActivityStream = {
      id: `act-${Date.now()}`,
      title: order.type === 'client' ? 'Pedido Móvil (Cliente)' : 'Pedido Móvil (Productor)',
      detail: `Nuevo pedido ${order.id} por $${order.total.toFixed(2)} M.N. de ${order.entityName}`,
      time: 'Hace un momento',
      location: 'Portal Móvil',
      type: 'info'
    };
    setActivities((prev) => [newAct, ...prev]);
  };

  const handleDeliverMobileOrder = (orderId: string) => {
    const order = mobileOrders.find(o => o.id === orderId);
    if (!order) return;

    if (order.type === 'client') {
      // It is a client cheese sale
      const mappedItems = order.items.map(i => ({
        productId: i.productId,
        name: i.name,
        quantityKg: i.quantity,
        pricePerKg: i.price,
        subtotal: i.subtotal
      }));

      const payMethod = order.paymentMethod === 'fiado' ? 'credit' : 'Efectivo';
      const paidAmt = order.paymentMethod === 'fiado' ? 0 : order.total;

      handleProcessSale(mappedItems, order.entityId, payMethod, undefined, paidAmt);
    } else {
      // It is a supplier supply order (comida / repuestos)
      if (order.paymentMethod === 'fiado') {
        setSuppliers((prevSuppliers) =>
          prevSuppliers.map((s) => {
            if (s.id === order.entityId) {
              const currentDebt = s.storeDebt || 0;
              return {
                ...s,
                storeDebt: currentDebt + order.total
              };
            }
            return s;
          })
        );

        // Create a receivable account bill
        const newBill: AccountBill = {
          id: `bill-rcv-sup-${Date.now()}`,
          type: 'receivable',
          entityId: order.entityId,
          entityName: order.entityName,
          amount: order.total,
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
          status: 'Pendiente',
          notes: `Consumos/Suministros entregados en Libreta de Queso`
        };
        setBills((prev) => [newBill, ...prev]);
      } else {
        // Cash payment, add to balance
        setBalance((prev) => prev + order.total);
      }

      // Record a transaction for the supplies sale
      const newTx: Transaction = {
        id: `TX-SUP-${Date.now().toString().slice(-4)}`,
        entity: order.entityName,
        category: 'ventas',
        date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        invoiceNumber: `F-INS-${Math.floor(Math.random() * 9000 + 1000)}`,
        amount: order.total,
        isIncome: true,
        status: 'Completado'
      };
      setTransactions((prev) => [newTx, ...prev]);
      try {
        addLocalDoc('transactions', newTx);
      } catch (err) {
        console.error("Error saving order tx to Local API:", err);
      }

      // Activity Stream log
      const newAct: ActivityStream = {
        id: `act-${Date.now()}`,
        title: 'Suministros Entregados',
        detail: `Entregado a ${order.entityName}: Insumos por $${order.total.toFixed(2)} M.N. (${order.paymentMethod === 'fiado' ? 'Libreta de Queso' : 'Contado'})`,
        time: 'Ahora mismo',
        location: 'Bodega de Insumos',
        type: 'sale',
        amount: order.total
      };
      setActivities((prev) => [newAct, ...prev]);
    }

    // Mark as delivered
    setMobileOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'Entregado' } : o))
    );

    addNotification(`Pedido ${orderId} despachado y registrado con éxito en el sistema.`, 'success');
  };

  const handleCancelMobileOrder = (orderId: string) => {
    setMobileOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'Cancelado' } : o))
    );
    addNotification(`Pedido ${orderId} cancelado.`, 'info');
  };

  // 2. Inventory Adjustment (Adjust single SKU stock / details)
  const handleUpdateProduct = async (id: string, updated: Partial<CheeseProduct>) => {
    // Always update local state immediately so UI reacts instantly
    setCheeseProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updated } : p))
    );
    try {
      await updateLocalDoc('products', id, updated);
    } catch (error) {
      console.warn("Product not in Local API or network error, updated locally:", error);
    }
  };

  const handleAddProduct = async (newProd: Omit<CheeseProduct, 'id'>) => {
    const freshProd: CheeseProduct = {
      ...newProd,
      id: crypto.randomUUID()
    };
    try {
      await addLocalDoc('products', freshProd);
      setCheeseProducts((prev) => [...prev, freshProd]);
    } catch (error) {
      console.error("Error adding product to Local API:", error);
      addNotification('Error al agregar el producto a la nube', 'warning');
      throw error;
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await deleteLocalDoc('products', id);
      setCheeseProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      console.error("Error deleting product from Local API:", error);
      addNotification('Error al eliminar el producto de la nube', 'warning');
      throw error;
    }
  };



  // 3. Purchase load (Carga de compras + balance owed increment)
  const handleLoadPurchase = async (purchase: {
    supplierId: string;
    items: (PurchaseItem | { productId: string; quantityKg: number | string; purchasePrice: number | string; sellingPrice?: number | string; marginPercent?: number | string; name: string; createNewItem?: boolean; })[];
    isCredit: boolean;
    paymentMethod?: string;
  }) => {
    const selectedSup = suppliers.find(s => s.id === purchase.supplierId);
    if (!selectedSup || purchase.items.length === 0) return;

    let totalCost = 0;
    let globalDeductionAmount = 0;
    const purchaseTxId = `F-COMP-${Math.floor(Math.random() * 8000 + 1000)}`;

    try {
      // Process each item asynchronously in Local API
      for (const item of purchase.items) {
        const itemQty = Number(item.quantityKg) || 0;
        const itemCost = Number(item.purchasePrice) || 0;
        const itemSelling = Number(item.sellingPrice) || 0;
        totalCost += itemQty * itemCost;

        let prod = cheeseProducts.find(p => p.id === item.productId);

        if (!prod) {
          const newProd: CheeseProduct = {
            id: crypto.randomUUID(),
            name: item.name || 'Producto Nuevo (IA)',
            category: 'Fresco', // Default or guess
            stockKg: itemQty,
            purchasePrice: itemCost,
            sellingPrice: itemSelling,
            alertThreshold: 5,
            agingDays: 0,
            origin: selectedSup?.name || '',
            unit: (item as any).unit === 'Bulto' ? 'Und' : ((item as any).unit || 'Kg')
          };
          await addLocalDoc('products', newProd);
          prod = newProd;
          
          setCheeseProducts(prev => [...prev, newProd]);
        } else {
          const currentStock = prod.stockKg || 0;
          // Update product document atomically
          await updateLocalDoc('products', prod.id, {
            stockKg: (cheeseProducts.find(p => p.id === prod.id)?.stockKg || 0) + itemQty,
            purchasePrice: itemCost,
            sellingPrice: itemSelling > 0 ? itemSelling : (prod.sellingPrice || 0)
          });
        }

        if (prod) {
          const currentStock = prod.stockKg || 0;
          // Record Kardex Movement
          const kardexMovement: KardexMovement = {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            productId: prod.id,
            productName: prod.name,
            unit: (getUnitLabel(prod) as any) || 'Und',
            type: 'ENTRADA_COMPRA',
            quantity: itemQty,
            previousStock: currentStock,
            newStock: currentStock + itemQty,
            unitCost: itemCost,
            totalCost: itemCost * itemQty,
            referenceId: purchaseTxId,
            userOrCashier: 'Sistema de Compras'
          };
          await addLocalDoc('kardex', kardexMovement);
        }
      }

      // --- CUENTAS POR PAGAR (FIADO / CONTADO) CON CRUCE AUTOMÁTICO DE SALDO ---
      let newBalanceOwed = Number(selectedSup.balanceOwed || 0);
      let newStoreDebt = Number(selectedSup.storeDebt || 0);
      let autoDeductedDebt = 0;

      if (purchase.isCredit) {
        if (newStoreDebt > 0) {
          if (totalCost <= newStoreDebt) {
            newStoreDebt = newStoreDebt - totalCost;
            autoDeductedDebt = totalCost;
          } else {
            autoDeductedDebt = newStoreDebt;
            const surplus = totalCost - newStoreDebt;
            newStoreDebt = 0;
            newBalanceOwed += surplus;
          }
        } else {
          newBalanceOwed += totalCost;
        }
      } else {
        // Si fue pagado de contado (Caja o Banco)
        const currentVault = settings.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };
        const updatedVault = { ...currentVault };
        const payMethod = purchase.paymentMethod || 'Efectivo / Caja Chica';
        if (payMethod.includes('Banco') || payMethod.includes('Pago Móvil')) {
          updatedVault.bankUsd = Math.max(0, (updatedVault.bankUsd || 0) - totalCost);
        } else {
          updatedVault.usd = Math.max(0, (updatedVault.usd || 0) - totalCost);
        }
        handleUpdateSettings({ centralVaultBalance: updatedVault });
      }

      setSuppliers((prev) =>
        prev.map((s) => {
          if (s.id === purchase.supplierId) {
            return { ...s, balanceOwed: newBalanceOwed, storeDebt: newStoreDebt };
          }
          return s;
        })
      );

      await updateLocalDoc('suppliers', purchase.supplierId, {
        balanceOwed: newBalanceOwed,
        storeDebt: newStoreDebt
      });

      const noteMessage = autoDeductedDebt > 0 
        ? `Compra de $${totalCost.toFixed(2)} procesada. Se descontaron automáticamente $${autoDeductedDebt.toFixed(2)} de la deuda en tienda.`
        : (purchase.isCredit ? 'Compra cargada a Libreta de Proveedor con éxito' : 'Compra al contado registrada y cancelada');

      addNotification(noteMessage, 'success');
    } catch (err) {
      console.error('Error saving purchase to DB:', err);
      addNotification('Error crítico al guardar la compra en base de datos', 'warning');
      return;
    }

    // Increase product stock and update prices in LOCAL STATE for React reactivity
    setCheeseProducts((prev) => {
      const nextProducts = [...prev];
      purchase.items.forEach(item => {
        const itemQty = Number(item.quantityKg) || 0;
        const itemCost = Number(item.purchasePrice) || 0;
        const itemSelling = Number(item.sellingPrice) || 0;
        const pIndex = nextProducts.findIndex(p => p.id === item.productId);
        if (pIndex !== -1) {
          nextProducts[pIndex] = {
            ...nextProducts[pIndex],
            stockKg: nextProducts[pIndex].stockKg + itemQty,
            purchasePrice: itemCost,
            sellingPrice: itemSelling > 0 ? itemSelling : nextProducts[pIndex].sellingPrice
          };
        }
      });
      return nextProducts;
    });

    const txItems = purchase.items.map(i => {
      const itemQty = Number(i.quantityKg) || 0;
      const itemCost = Number(i.purchasePrice) || 0;
      return {
        name: i.name,
        kg: itemQty,
        pricePerKg: itemCost,
        totalUsd: itemQty * itemCost,
        totalBs: (itemQty * itemCost) * (settings.exchangeRate || 42.50)
      };
    });

    // Generate transaction for Ledger ('Entrega')
    if (purchase.isCredit) {
      const deliveryTx: Transaction = {
        id: `TX-${Date.now()}`,
        entity: selectedSup.name,
        supplierId: selectedSup.id,
        category: 'compras',
        date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        invoiceNumber: purchaseTxId,
        amount: totalCost,
        isIncome: true, // Suma al haber del quesero
        status: 'Completado',
        paymentMethod: 'A la Libreta',
        notes: `Recibido ${purchase.items.map(i=>i.quantityKg + 'kg').join(', ')}. Carga a Cuentas por Pagar.`,
        items: txItems,
        createdAt: Date.now()
      };
      
      setTransactions((prev) => [deliveryTx, ...prev]);
      try {
        addLocalDoc('transactions', deliveryTx);
      } catch (e) { console.error(e); }
    } else {
      // Compra al Contado: Generar ciclo completo (Entrega de Queso [+] y Pago Inmediato al Contado [-])
      const nowMs = Date.now();
      const deliveryTx: Transaction = {
        id: `TX-ENT-${nowMs}`,
        entity: selectedSup.name,
        supplierId: selectedSup.id,
        category: 'compras',
        date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        invoiceNumber: purchaseTxId,
        amount: totalCost,
        isIncome: true, // Entrada/Entrega de queso (+Suma en libreta)
        status: 'Completado',
        paymentMethod: 'Contado (Entrega)',
        notes: `Entrega de ${purchase.items.map(i=>i.quantityKg + 'kg').join(', ')} (${purchase.paymentMethod || 'Efectivo / Caja Chica'}).`,
        items: txItems,
        createdAt: nowMs
      };

      const paymentTx: Transaction = {
        id: `TX-PAG-${nowMs + 1}`,
        entity: selectedSup.name,
        supplierId: selectedSup.id,
        category: 'compras',
        date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        invoiceNumber: `PAGO-${purchaseTxId}`,
        amount: totalCost,
        isIncome: false, // Cancelación/Pago inmediato (-Resta en libreta)
        status: 'Completado',
        paymentMethod: purchase.paymentMethod || 'Efectivo / Caja Chica',
        notes: `Pago al contado cancelado de inmediato por compra de queso.`,
        createdAt: nowMs + 1
      };

      setTransactions((prev) => [paymentTx, deliveryTx, ...prev]);
      try {
        addLocalDoc('transactions', deliveryTx);
        addLocalDoc('transactions', paymentTx);
      } catch (e) { console.error(e); }
    }

    // Add activity
    const newAct: ActivityStream = {
      id: `act-${Date.now()}`,
      title: 'Inventario Actualizado (Factura Múltiple)',
      detail: `Se cargaron ${purchase.items.length} ítems del proveedor ${selectedSup.name}. Costo total: $${totalCost.toFixed(2)} USD`,
      time: 'Justo ahora',
      location: 'Sistema (Carga de Mercancía)',
      type: 'info'
    };
    setActivities((prev) => [newAct, ...prev]);
  };

  // 4. Ledger shrinkage batch weigh (Evaporación natural)
  const handleUpdateBatchWeight = (batchId: string, currentWeight: number) => {
    setCheeseBatches((prev) =>
      prev.map((b) => {
        if (b.id === batchId) {
          const shrink = Math.max(0, b.initialWeightKg - currentWeight);
          return {
            ...b,
            currentWeightKg: currentWeight,
            shrinkageKg: shrink,
            status: currentWeight <= 0 ? 'Agotado' : b.status
          };
        }
        return b;
      })
    );
  };

  // 5. Clients & Debt repayments
  const handleAddClient = async (client: Omit<ClientProfile, 'id' | 'outstandingDebt'> & { loyaltyPoints?: number }) => {
    const newCli: ClientProfile = {
      ...client,
      id: `cli-${Date.now()}`,
      outstandingDebt: 0,
      loyaltyPoints: Number(client.loyaltyPoints || 0)
    };
    try {
      await addLocalDoc('clients', newCli);
    } catch (err) {
      console.error("Error al crear cliente:", err);
      addNotification("Error al guardar cliente en base de datos", "warning");
    }
  };

  const handleUpdateClient = async (clientId: string, updates: Partial<ClientProfile>) => {
    try {
      await updateLocalDoc('clients', clientId, updates);
      addNotification("Perfil de cliente actualizado", "success");
    } catch (err) {
      console.error("Error al actualizar cliente:", err);
      addNotification("Error al actualizar cliente", "warning");
    }
  };

  const handleRecordDebtPayment = async (clientId: string, amount: number, paymentMethod: string, notes?: string, paymentBreakdown?: any) => {
    const selectedClient = clients.find(c => c.id === clientId);
    const newDebt = Math.max(0, (selectedClient?.outstandingDebt || 0) - amount);

    // Decrement client outstandingDebt in local state
    setClients((prev) =>
      prev.map((c) => {
        if (c.id === clientId) {
          return { ...c, outstandingDebt: newDebt };
        }
        return c;
      })
    );

    // Persist client outstandingDebt to local database
    try {
      await updateLocalDoc('clients', clientId, { outstandingDebt: newDebt });
    } catch (err) {
      console.error("Error al actualizar deuda del cliente en DB:", err);
    }

    // Mark corresponding Client Bill as paid if it balances out
    setBills((prevBills) => {
      let remainingPayment = amount;
      return prevBills.map((b) => {
        if (b.type === 'receivable' && b.entityId === clientId && b.status === 'Pendiente') {
          if (remainingPayment >= b.amount) {
            remainingPayment -= b.amount;
            updateLocalDoc('bills', b.id, { status: 'Pagado' }).catch(e => console.error(e));
            return { ...b, status: 'Pagado' };
          }
        }
        return b;
      });
    });

    // Increment business balance
    setBalance((prev) => prev + amount);

    // Actualizar Bóveda Central con el dinero del abono
    const currentVault = settings?.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };
    const rate = settings?.exchangeRate || 42.5;
    let newVault = { ...currentVault };

    if (paymentBreakdown) {
      if (paymentBreakdown.cashUsd) newVault.usd += Number(paymentBreakdown.cashUsd);
      if (paymentBreakdown.cashBs) newVault.bs += Number(paymentBreakdown.cashBs);
      if (paymentBreakdown.pagoMovilBs) newVault.bankBs += Number(paymentBreakdown.pagoMovilBs);
      if (paymentBreakdown.puntoBs) newVault.bankBs += Number(paymentBreakdown.puntoBs);
      if (paymentBreakdown.biopagoBs) newVault.bankBs += Number(paymentBreakdown.biopagoBs);
    } else {
      const pm = (paymentMethod || 'Efectivo').toLowerCase();
      if (pm.includes('bs') || pm.includes('ves')) {
        newVault.bs += (amount * rate);
      } else if (pm.includes('movil') || pm.includes('transfer') || pm.includes('tarjeta') || pm.includes('punto') || pm.includes('bio')) {
        newVault.bankBs += (amount * rate);
      } else {
        newVault.usd += amount;
      }
    }

    handleUpdateSettings({ centralVaultBalance: newVault });

    // Create a transaction record
    const newTx: Transaction = {
      id: `TX-${Date.now().toString().slice(-4)}`,
      entity: selectedClient ? selectedClient.name : 'Cobro de Cuenta',
      clientId: clientId,
      category: 'credito',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: `REC-${Math.floor(Math.random() * 9000 + 1000)}`,
      amount: amount,
      paidAmount: amount as any,
      isIncome: true,
      status: 'Completado',
      paymentMethod: paymentMethod,
      notes: notes || 'Abono de Cuenta por Cobrar',
      createdAt: Date.now()
    };
    (newTx as any).isAbono = true;

    setTransactions((prev) => [newTx, ...prev]);

    try {
      await addLocalDoc('transactions', newTx);
    } catch (err) {
      console.error("Error al guardar transaccion en DB:", err);
    }

    // CREATE ABONO RECORD IN 'sales' FOR ARQUEO DE CAJA
    try {
      const saleId = `ABONO-${Date.now().toString().slice(-4)}`;
      const dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const saleDoc = {
        id: saleId,
        date: `${dateStr} ${timeStr}`,
        createdAt: Date.now(),
        clientName: selectedClient ? selectedClient.name : 'Cliente',
        clientId: clientId,
        supplierId: null,
        items: [{ name: 'Abono a Cuenta por Cobrar', quantityKg: 1, pricePerKg: amount, subtotal: amount }],
        total: 0, // 0 to avoid double counting gross revenue, but breakdown has the actual cash
        paymentMethod: paymentMethod,
        notes: notes || 'Abono de Cuenta por Cobrar',
        paidAmount: amount,
        debtAmount: 0,
        exchangeRate: settings.exchangeRate || 0,
        paymentBreakdown: paymentBreakdown || null,
        isAbono: true
      };
      await addLocalDoc('sales', saleDoc);
    } catch (err) {
      console.error("Error guardando recibo de abono en Local API:", err);
    }
  };

  // 6. Suppliers & Repayments of accounts payable
  const handleAddSupplier = async (sup: Omit<SupplierProfile, 'id' | 'balanceOwed'>) => {
    const newSup: SupplierProfile = {
      ...sup,
      id: `sup-${Date.now()}`,
      balanceOwed: 0,
      storeDebt: 0
    };
    try {
      await addLocalDoc('suppliers', newSup);
    } catch (err) {
      console.error("Error al crear proveedor:", err);
      addNotification("Error al guardar proveedor en base de datos", "warning");
    }
  };

  const handleUpdateSupplier = async (supplierId: string, updates: Partial<SupplierProfile>) => {
    try {
      await updateLocalDoc('suppliers', supplierId, updates);
      addNotification("Perfil de proveedor actualizado", "success");
    } catch (err) {
      console.error("Error al actualizar proveedor:", err);
      addNotification("Error al actualizar proveedor", "warning");
    }
  };

  const handlePaySupplierBill = (billId: string, supplierId: string, amount: number) => {
    // Update bills statuses
    setBills((prev) =>
      prev.map((b) => (b.id === billId ? { ...b, status: 'Pagado' } : b))
    );

    // Decrement supplier balanceOwed
    setSuppliers((prev) =>
      prev.map((s) => {
        if (s.id === supplierId) {
          const newBal = Math.max(0, (s.balanceOwed || 0) - amount);
          updateLocalDoc('suppliers', supplierId, { balanceOwed: newBal }).catch(e => console.error(e));
          return { ...s, balanceOwed: newBal };
        }
        return s;
      })
    );

    // Decrement business cash balance
    setBalance((prev) => prev - amount);

    // Create a transaction record
    const selectedSup = suppliers.find(s => s.id === supplierId);
    const newTx: Transaction = {
      id: `TX-${Date.now().toString().slice(-4)}`,
      entity: selectedSup ? selectedSup.name : 'Pago a Proveedor',
      supplierId: supplierId,
      category: 'compras',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: `PAGO-${Math.floor(Math.random() * 9000 + 1000)}`,
      amount: amount,
      isIncome: false,
      status: 'Completado',
      createdAt: Date.now()
    };
    setTransactions((prev) => [newTx, ...prev]);
    addLocalDoc('transactions', newTx).catch(e => console.error(e));
  };

  const handlePaySupplierRemainingBalance = async (supplierId: string, amount: number, paymentSource: string, note?: string, currency?: 'USD' | 'VES') => {
    const selectedSup = suppliers.find(s => s.id === supplierId);
    if (!selectedSup) return;

    const currentBalanceOwed = Number(selectedSup.balanceOwed) || 0;
    const currentStoreDebt = Number(selectedSup.storeDebt) || 0;

    let newBalanceOwed = 0;
    let newStoreDebt = currentStoreDebt;

    if (amount <= currentBalanceOwed) {
      newBalanceOwed = currentBalanceOwed - amount;
    } else {
      newBalanceOwed = 0;
      const excess = amount - currentBalanceOwed;
      newStoreDebt = currentStoreDebt + excess;
    }

    setSuppliers(prev => prev.map(s => {
      if (s.id === supplierId) {
        return { ...s, balanceOwed: newBalanceOwed, storeDebt: newStoreDebt };
      }
      return s;
    }));

    try {
      await updateLocalDoc('suppliers', supplierId, { balanceOwed: newBalanceOwed, storeDebt: newStoreDebt });
    } catch (err) {
      console.error('Error al actualizar balance proveedor en DB:', err);
    }

    const currentVault = settings?.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };
    const rate = Number(settings?.exchangeRate) > 1 ? Number(settings.exchangeRate) : 42.5;
    let newVault = { ...currentVault };
    const src = (paymentSource || '').toLowerCase();

    if (src.includes('pago móvil') || src.includes('pago movil') || src.includes('banco') || src.includes('transferencia')) {
      const bsToDeduct = Math.round((amount * rate) * 100) / 100;
      newVault.bankBs = Math.round(((newVault.bankBs || 0) - bsToDeduct) * 100) / 100;
    } else if (currency === 'VES' || src.includes('efectivo bs')) {
      const bsToDeduct = Math.round((amount * rate) * 100) / 100;
      newVault.bs = Math.round(((newVault.bs || 0) - bsToDeduct) * 100) / 100;
    } else {
      newVault.usd = Math.round(((newVault.usd || 0) - amount) * 100) / 100;
    }
    handleUpdateSettings({ centralVaultBalance: newVault });

    const newTx: Transaction = {
      id: `TX-${Date.now().toString().slice(-4)}`,
      entity: selectedSup.name,
      supplierId: supplierId,
      category: 'compras',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: `PAGO-${Math.floor(Math.random() * 9000 + 1000)}`,
      amount: amount,
      isIncome: false,
      status: 'Completado',
      paymentMethod: paymentSource || 'Efectivo / Caja Chica',
      notes: note || `Pago de saldo pendiente a productor (${currency || 'USD'})`,
      createdAt: Date.now()
    };

    setTransactions(prev => [newTx, ...prev]);
    try {
      await addLocalDoc('transactions', newTx);
    } catch (err) {
      console.error('Error al guardar transaccion de pago en DB:', err);
    }
  };

  const handleRecordSupplierStorePayment = async (supplierId: string, amount: number, method: string, note: string, currency: 'USD' | 'VES') => {
    const selectedSup = suppliers.find(s => s.id === supplierId);
    if (!selectedSup) return;

    const newStoreDebt = Math.max(0, (selectedSup.storeDebt || 0) - amount);

    setSuppliers(prev => prev.map(s => {
      if (s.id === supplierId) {
        return { ...s, storeDebt: newStoreDebt };
      }
      return s;
    }));

    try {
      await updateLocalDoc('suppliers', supplierId, { storeDebt: newStoreDebt });
    } catch (err) {
      console.error('Error al actualizar deuda tienda proveedor en DB:', err);
    }

    const currentVault = settings?.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };
    const rate = Number(settings?.exchangeRate) > 1 ? Number(settings.exchangeRate) : 42.5;
    let newVault = { ...currentVault };
    const m = (method || '').toLowerCase();

    if (m.includes('pago móvil') || m.includes('pago movil') || m.includes('banco') || m.includes('transferencia')) {
      const bsToAdd = Math.round((amount * rate) * 100) / 100;
      newVault.bankBs = Math.round(((newVault.bankBs || 0) + bsToAdd) * 100) / 100;
    } else if (currency === 'VES' || m.includes('efectivo bs')) {
      const bsToAdd = Math.round((amount * rate) * 100) / 100;
      newVault.bs = Math.round(((newVault.bs || 0) + bsToAdd) * 100) / 100;
    } else {
      newVault.usd = Math.round(((newVault.usd || 0) + amount) * 100) / 100;
    }
    handleUpdateSettings({ centralVaultBalance: newVault });

    const newTx: Transaction = {
      id: `TX-${Date.now().toString().slice(-4)}`,
      entity: selectedSup.name,
      supplierId: supplierId,
      category: 'credito',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: `ABONO-PROV-${Math.floor(Math.random() * 9000 + 1000)}`,
      amount: amount,
      paidAmount: amount,
      isIncome: true,
      isAbono: true,
      status: 'Completado',
      paymentMethod: method || 'Efectivo',
      notes: note || `Cobro de deuda de tienda a productor (${currency || 'USD'})`,
      createdAt: Date.now()
    };

    setTransactions(prev => [newTx, ...prev]);
    try {
      await addLocalDoc('transactions', newTx);
    } catch (err) {
      console.error('Error al guardar abono de proveedor en DB:', err);
    }
  };

  const handleNetSupplierBalances = async (supplierId: string) => {
    const selectedSup = suppliers.find(s => s.id === supplierId);
    if (!selectedSup) return;

    const bal = Number(selectedSup.balanceOwed || 0);
    const debt = Number(selectedSup.storeDebt || 0);
    if (bal <= 0 || debt <= 0) return;

    const minAmt = Math.min(bal, debt);
    const newBal = bal - minAmt;
    const newDebt = debt - minAmt;

    setSuppliers(prev => prev.map(s => {
      if (s.id === supplierId) {
        return { ...s, balanceOwed: newBal, storeDebt: newDebt };
      }
      return s;
    }));

    try {
      await updateLocalDoc('suppliers', supplierId, { balanceOwed: newBal, storeDebt: newDebt });
    } catch (err) {
      console.error('Error al compensar saldos en DB:', err);
    }

    const newTx: Transaction = {
      id: `TX-${Date.now().toString().slice(-4)}`,
      entity: selectedSup.name,
      supplierId: supplierId,
      category: 'compras',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: `CRUCE-${Math.floor(Math.random() * 9000 + 1000)}`,
      amount: minAmt,
      isIncome: false,
      status: 'Completado',
      paymentMethod: 'Compensación Interna',
      notes: `Compensación automática de saldos. Se cruzaron $${minAmt.toFixed(2)} USD.`,
      createdAt: Date.now()
    };

    setTransactions(prev => [newTx, ...prev]);
    try {
      await addLocalDoc('transactions', newTx);
    } catch (err) {
      console.error('Error al guardar cruce en DB:', err);
    }
  };

  // 7. Operating expenses
  const handleAddExpense = (newExp: Omit<OperatingExpense, 'id'>) => {
    const expense: OperatingExpense = {
      ...newExp,
      id: `exp-${Date.now()}`
    };
    setExpenses((prev) => [expense, ...prev]);

    // Decrease balance
    setBalance((prev) => prev - newExp.amount);

    // Update Tesorería
    const currentInitials = settings?.sabanotaInitials || {
      drawerUsd: 0, drawerBs: 0, bankBalanceBs: 0, bankBalanceUsd: 0, totalCapital: 0
    };
    
    const updatedSabanota = { ...currentInitials };
    const exchangeRate = settings?.exchangeRate || 45;
    
    // Asumimos que paymentMethod puede ser "Efectivo" o "Transferencia" o "Tarjeta" etc
    const method = (newExp as any).paymentMethod || 'Efectivo';
    if (method.includes('Efectivo')) {
       // Asumiendo Efectivo USD
       updatedSabanota.drawerUsd -= newExp.amount;
    } else {
       // Asumiendo Bs convertido
       updatedSabanota.bankBalanceBs -= (newExp.amount * exchangeRate);
    }

    updatedSabanota.totalCapital = updatedSabanota.drawerUsd + (updatedSabanota.drawerBs / exchangeRate) + (updatedSabanota.bankBalanceBs / exchangeRate) + updatedSabanota.bankBalanceUsd;

    handleUpdateSettings({ sabanotaInitials: updatedSabanota });

    // Log transaction
    const newTx: Transaction = {
      id: `TX-${Date.now().toString().slice(-4)}`,
      entity: newExp.description,
      category: 'gastos',
      date: newExp.date,
      invoiceNumber: `EG-${Math.floor(Math.random() * 8000 + 1000)}`,
      amount: newExp.amount,
      isIncome: false,
      status: 'Completado',
      paymentMethod: method
    };
    setTransactions((prev) => [newTx, ...prev]);
  };

  // 8. Complaints box
  const handleAddComplaint = (comp: Omit<CustomerComplaint, 'id' | 'status' | 'date'>) => {
    const newComp: CustomerComplaint = {
      ...comp,
      id: `comp-${Date.now().toString().slice(-4)}`,
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      status: 'Pendiente'
    };
    setComplaints((prev) => [newComp, ...prev]);
  };

  const handleUpdateComplaintStatus = (id: string, newStatus: 'Pendiente' | 'Atendida' | 'Desestimada') => {
    setComplaints((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            status: newStatus === 'Atendida' ? 'Resuelto' : 'Pendiente',
            resolutionNotes: newStatus === 'Atendida' ? 'Revisión y solución efectuada con éxito.' : ''
          };
        }
        return c;
      })
    );
  };

  // 9. Administration
  const handleUpdateSettings = async (newSettings: Partial<BusinessSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings })); // Optimistic update
    try {
      try {
        await updateLocalDoc('settings', 'general', newSettings);
      } catch (err) {
        await addLocalDoc('settings', { id: 'general', ...newSettings });
      }
    } catch (error) {
      console.error("Error saving settings to Local API:", error);
      addNotification("Error de red: La tasa y ajustes se guardaron solo localmente.", "warning");
    }
  };

  useEffect(() => {
    const syncRate = () => {
      import('./services/exchangeRateService').then(({ fetchOfficialBcvRate }) => {
        fetchOfficialBcvRate()
          .then(({ rate, timestamp }) => {
            handleUpdateSettings({ exchangeRate: rate, lastRateSync: timestamp });
          })
          .catch(err => console.warn("Fallo auto-sync BCV", err));
      });
    };
    
    // Run once on mount
    syncRate();
    
    // Run on window focus to ensure fresh rate
    window.addEventListener('focus', syncRate);
    return () => window.removeEventListener('focus', syncRate);
  }, []);

  const handleResetAccounting = async () => {
    // Import dynamically or assume it's imported (wait, let me import it at the top)
    // Wipe local state
    setTransactions([]);
    setBills([]);
    setExpenses([]);
    setActivities([]);
    setBalance(0);
    setTotalSalesCount(0);
    setTotalSalesRevenue(0);
    setClients(prev => prev.map(c => ({ ...c, outstandingDebt: 0 })));
    setSuppliers(prev => prev.map(s => ({ ...s, balanceOwed: 0, storeDebt: 0 })));
    
    // Wipe Local API data via backupService
    const { resetAccountingData } = await import('./services/backupService');
    await resetAccountingData();
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-editorial-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono text-editorial-text-muted uppercase tracking-widest">
            Verificando sesión segura...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginView
        users={users}
        onLoginSuccess={handleLoginSuccess}
        onAddNotification={(msg, type) => addNotification(msg, type as 'info' | 'success' | 'warning' || 'info')}
      />
    );
  }
  return (
    <div className="min-h-screen bg-editorial-bg text-editorial-text-primary flex flex-col md:flex-row relative">
      {/* Editorial Vertical Navigation Drawer Sidebar */}
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        onLogout={handleLogout}
        isAdmin={currentUser?.role === 'admin'}
        userRole={currentUser?.role || 'cajero'}
        userName={currentUser?.name}
        isOpen={isSidebarOpen}
        exchangeRate={settings.exchangeRate}
        lastRateSync={(settings as any).lastRateSync}
        onSyncRate={(rate, date) => {
          handleUpdateSettings({ exchangeRate: rate, lastRateSync: date });
          addNotification(`Tasa BCV actualizada a ${rate}`, 'success');
        }}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      {/* Main Canvas Frame */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Horizontal Navigation Header */}
        <Header
          currentView={currentView}
          notificationCount={complaints.filter(c => c.status === 'Pendiente').length + mobileOrders.filter(o => o.status === 'Pendiente').length}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          exchangeRate={settings.exchangeRate || 0}
        />

        {/* Scrollable Main View Stage */}
        <main className={`flex-1 p-6 sm:p-10 mx-auto w-full overflow-y-auto ${currentView === 'inventory' ? 'max-w-full' : 'max-w-7xl'}`}>
          {currentView === 'portal-dashboard' && (
            <DashboardView
              transactions={transactions}
              balance={balance}
              cheeseProducts={cheeseProducts}
              clients={clients}
              suppliers={suppliers}
              onNavigate={setCurrentView}
              onAddNotification={(msg) => addNotification(msg, 'info')}
              settings={settings}
              expenses={expenses}
              sales={transactions.filter(t => t.category === 'ventas')}
            />
          )}

          {currentView === 'kardex' && (
            <KardexView />
          )}

          {currentView === 'pos-terminal' && (
            <CheesePOSView
              exchangeRate={settings.exchangeRate || 0}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              products={cheeseProducts}
              clients={clients}
              suppliers={suppliers}
              mobileOrders={mobileOrders}
              allTransactions={transactions}
              onProcessSale={async (sale) =>
                handleProcessSale(
                  sale.items,
                  sale.client?.id || undefined,
                  sale.paymentMethod,
                  sale.supplier?.id || undefined,
                  sale.paidAmount,
                  sale.total,
                  sale.addedPayments,
                  sale.changeAmount,
                  sale.changeCurrency,
                  sale.changeReference,
                  sale.mixedChange,
                  sale.changeBs,
                  sale.bcvRateAtSettlement
                )
              }
              onVoidSale={handleVoidSale}
              salesHistory={transactions.filter(t => t.category === 'ventas')}
              dailySalesCount={totalSalesCount}
              dailyRevenue={totalSalesRevenue}
              onAddNotification={(msg, type) => addNotification(msg, type)}
              onUpdateProduct={handleUpdateProduct}
            />
          )}

          {currentView === 'inventory' && (
            <CheeseInventoryView
              isAdmin={currentUser?.role === 'admin'}
              products={cheeseProducts}
              batches={cheeseBatches}
              suppliers={suppliers}
              exchangeRate={42.50}
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              onLoadPurchase={handleLoadPurchase}
              onUpdateBatchWeight={handleUpdateBatchWeight}
              onAddNotification={addNotification}
            />
          )}

          {currentView === 'clients' && (
            <ClientsCreditView
              clients={clients}
              salesHistory={transactions}
              exchangeRate={settings.exchangeRate || 42.50}
              onAddClient={handleAddClient}
              onUpdateClient={handleUpdateClient}
              onRecordDebtPayment={handleRecordDebtPayment}
              onAddNotification={addNotification}
            />
          )}

          {currentView === 'suppliers' && (
            <SuppliersDebtsView
              suppliers={suppliers}
              transactions={transactions}
              cheeseProducts={cheeseProducts}
              businessBalance={balance}
              exchangeRate={settings.exchangeRate || 42.50}
              onAddSupplier={handleAddSupplier}
              onUpdateSupplier={handleUpdateSupplier}
              onPaySupplierBill={handlePaySupplierBill}
              onRecordSupplierStorePayment={handleRecordSupplierStorePayment}
              onNetSupplierBalances={handleNetSupplierBalances}
              onPaySupplierRemainingBalance={handlePaySupplierRemainingBalance}
              onLoadPurchase={handleLoadPurchase}
              onAddNotification={addNotification}
              isSidebarOpen={isSidebarOpen}
            />
          )}

          {currentView === 'finances' && (
            <FinancesAnalysisView
              expenses={expenses}
              transactions={transactions}
              businessBalance={balance}
              totalSalesRevenue={totalSalesRevenue}
              products={cheeseProducts}
              onAddExpense={handleAddExpense}
              onAddNotification={addNotification}
            />
          )}

          {currentView === 'support' && (
            <ComplaintBoxView
              complaints={complaints}
              onAddComplaint={handleAddComplaint}
              onUpdateComplaintStatus={handleUpdateComplaintStatus}
              onAddNotification={addNotification}
            />
          )}


          {currentView === 'settings' && (
            <SettingsAdminView
              settings={settings}
              users={users}
              onUpdateSettings={handleUpdateSettings}
              onAddNotification={addNotification}
              onResetAccounting={handleResetAccounting}
            />
          )}

          {currentView === 'access-control' && (
            <AccessControlView isAdmin={currentUser?.role === 'admin'} />
          )}

          {currentView === 'contador-ia' && (
            <ContadorIAView 
              isAdmin={currentUser?.role === 'admin'} 
              vaultBalance={settings.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 }}
              exchangeRate={settings.exchangeRate || 0}
              cheeseTrips={cheeseTrips}
              cheeseProducts={cheeseProducts}
              clients={clients}
              suppliers={suppliers}
              transactions={transactions}
              onCreateTrip={handleCreateTrip}
              onUpdateTrip={handleUpdateTrip}
              onSettleTrip={handleSettleTrip}
              onUpdateSupplier={handleUpdateSupplier}
              onAddNotification={addNotification}
              onUpdateVault={async (updates) => {
                await handleUpdateSettings({
                  centralVaultBalance: {
                    ...(settings.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 }),
                    ...updates
                  }
                });
              }}
              onAddTransaction={(tx) => {
                  const nowMs = Date.now();
                  const newTx: Transaction = {
                    id: `TX-${nowMs.toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`,
                    entity: 'Bóveda Banco Central',
                    date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
                    invoiceNumber: `BOV-${Math.floor(Math.random() * 9000 + 1000)}`,
                    status: 'Completado',
                    createdAt: nowMs,
                    ...tx
                  } as Transaction;
                  
                  setTransactions(prev => [newTx, ...prev]);
                  try {
                    addLocalDoc('transactions', newTx);
                  } catch (e) {
                    console.error(e);
                  }

                  const pm = (tx.paymentMethod || '').toLowerCase().trim();
                  const rate = (tx as any).exchangeRate || (tx as any).bcvRate || settings.exchangeRate || 42.5;
                  const isBs = (tx as any).currency === 'BS' || (tx as any).currency === 'VES';
                  
                  setSettings(prevSettings => {
                    const currentVault = prevSettings.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };
                    const updatedVault = { ...currentVault };
                    
                    if (tx.isIncome) {
                       // 1. Efectivo USD
                       if (pm === 'efectivo' || pm === 'efectivo usd' || pm === 'usd efectivo' || (pm.includes('efectivo') && (pm.includes('$') || pm.includes('usd') || (!pm.includes('bs') && !pm.includes('ves'))))) {
                         updatedVault.usd += (tx.amount || 0);
                       } 
                       // 2. Efectivo Bs
                       else if (pm === 'efectivo bs' || pm === 'bs efectivo' || (pm.includes('efectivo') && (pm.includes('bs') || pm.includes('ves')))) {
                         const bsAmt = isBs ? (tx.amount || 0) : ((tx.amount || 0) * rate);
                         updatedVault.bs += bsAmt;
                       } 
                       // 3. Banco USD / Zelle
                       else if (pm === 'banco usd' || pm === 'banco digital usd' || pm.includes('banco usd') || pm.includes('zelle') || (pm.includes('transfer') && (pm.includes('usd') || pm.includes('$')))) {
                         updatedVault.bankUsd += (tx.amount || 0);
                       } 
                       // 4. Banco Bs / Pago Móvil / Transferencia Bs / Punto / Biopago
                       else if (pm.includes('movil') || pm.includes('móvil') || pm.includes('transfer') || pm.includes('punto') || pm.includes('banco / pago móvil') || pm.includes('banco bs') || pm.includes('bio') || pm.includes('bs') || pm.includes('ves')) {
                         const bankBsAmt = isBs ? (tx.amount || 0) : ((tx.amount || 0) * rate);
                         updatedVault.bankBs += bankBsAmt;
                       } 
                       // 5. Fallback a Banco USD
                       else {
                         updatedVault.bankUsd += (tx.amount || 0);
                       }
                    } else {
                       // 1. Efectivo USD
                       if (pm === 'efectivo' || pm === 'efectivo usd' || pm === 'usd efectivo' || (pm.includes('efectivo') && (pm.includes('$') || pm.includes('usd') || (!pm.includes('bs') && !pm.includes('ves'))))) {
                         updatedVault.usd = Math.max(0, updatedVault.usd - (tx.amount || 0));
                       } 
                       // 2. Efectivo Bs
                       else if (pm === 'efectivo bs' || pm === 'bs efectivo' || (pm.includes('efectivo') && (pm.includes('bs') || pm.includes('ves')))) {
                         const bsAmt = isBs ? (tx.amount || 0) : ((tx.amount || 0) * rate);
                         updatedVault.bs = Math.max(0, updatedVault.bs - bsAmt);
                       } 
                       // 3. Banco USD / Zelle
                       else if (pm === 'banco usd' || pm === 'banco digital usd' || pm.includes('banco usd') || pm.includes('zelle') || (pm.includes('transfer') && (pm.includes('usd') || pm.includes('$')))) {
                         updatedVault.bankUsd = Math.max(0, updatedVault.bankUsd - (tx.amount || 0));
                       } 
                       // 4. Banco Bs / Pago Móvil / Transferencia Bs / Punto / Biopago
                       else if (pm.includes('movil') || pm.includes('móvil') || pm.includes('transfer') || pm.includes('punto') || pm.includes('banco / pago móvil') || pm.includes('banco bs') || pm.includes('bio') || pm.includes('bs') || pm.includes('ves')) {
                         const bankBsAmt = isBs ? (tx.amount || 0) : ((tx.amount || 0) * rate);
                         updatedVault.bankBs = Math.max(0, updatedVault.bankBs - bankBsAmt);
                       } 
                       // 5. Fallback a Banco USD
                       else {
                         updatedVault.bankUsd = Math.max(0, updatedVault.bankUsd - (tx.amount || 0));
                       }
                    }
                    
                    try {
                      updateLocalDoc('settings', 'general', { centralVaultBalance: updatedVault });
                    } catch (err) {
                      console.error('Error updating vault balance doc:', err);
                    }
                    return { ...prevSettings, centralVaultBalance: updatedVault };
                  });
               }}
            />
          )}

          {currentView === 'collections' && (

            <CollectionsView

              onAddNotification={(msg, type) => addNotification(msg, type || 'info')}

            />

          )}
      </main>
      </div>


      {/* Modern High-End Editorial Toast Stack Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-editorial-card border border-editorial-border rounded p-4 shadow-2xl flex items-start gap-3.5 transform translate-y-0 transition-transform duration-300 animate-slide-up select-none"
          >
            {toast.type === 'success' && (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            )}
            {toast.type === 'info' && (
              <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            )}
            {toast.type === 'warning' && (
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            )}

            <div className="flex-1 min-w-0">
              <span className="block text-[10px] font-mono tracking-widest text-editorial-text-muted uppercase">
                {toast.type === 'success' ? 'SISTEMA CORRECTO' : toast.type === 'info' ? 'DETALLE AUDITORÍA' : 'ALERTA CRÍTICA'}
              </span>
              <p className="text-xs text-editorial-text-primary mt-1 leading-snug">
                {toast.message}
              </p>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 rounded text-editorial-text-muted hover:text-editorial-text-primary hover:bg-editorial-bg cursor-pointer shrink-0 mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
