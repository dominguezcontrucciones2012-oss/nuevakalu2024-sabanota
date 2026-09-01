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
  CentralVaultBalance
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

// New specialized ERP Views
import CheesePOSView from './components/CheesePOSView';
import CheeseInventoryView from './components/CheeseInventoryView';
import KardexView from './components/KardexView';
import CheeseTripsView from './components/CheeseTripsView';
import ClientsCreditView from './components/ClientsCreditView';
import SuppliersDebtsView from './components/SuppliersDebtsView';
import FinancesAnalysisView from './components/FinancesAnalysisView';
import ComplaintBoxView from './components/ComplaintBoxView';
import SettingsAdminView from './components/SettingsAdminView';
import MobilePortalsView from './components/MobilePortalsView';
import AccessControlView from './components/AccessControlView';
import ContadorIAView from './components/ContadorIAView';
import CollectionsView from './components/contador/CollectionsView';

import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { onCollectionSnapshot, addLocalDoc, updateLocalDoc, deleteLocalDoc, fetchCollection } from './services/localApi';
import { fetchLocalProducts, updateLocalProduct, addLocalProduct, deleteLocalProduct } from './services/productApi';

interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning';
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('kalu_auth_state') === 'true';
  });
  const [currentUser, setCurrentUser] = useState<UserIdentity | null>(() => {
    const saved = localStorage.getItem('kalu_current_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [currentView, setCurrentView] = useState<ViewType>('portal-dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [mobileOrders, setMobileOrders] = useState<MobileOrder[]>([]);
  const [cheeseTrips, setCheeseTrips] = useState<CheeseTrip[]>(() => {
    const saved = localStorage.getItem('kalu_cheese_trips');
    return saved ? JSON.parse(saved) : [];
  });
  // Global Ledger States
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('kalu_sales_history');
    return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
  });
  const [users, setUsers] = useState<UserIdentity[]>(INITIAL_USERS);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(INITIAL_PAYMENT_METHODS);
  const [activities, setActivities] = useState<ActivityStream[]>(() => {
    const saved = localStorage.getItem('kalu_activities');
    return saved ? JSON.parse(saved) : INITIAL_ACTIVITIES;
  });

  // Toast stack
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Finanzas consolidadas: centralVaultBalance ahora reside en settings.centralVaultBalance


  const [balance, setBalance] = useState<number>(() => {
    const saved = localStorage.getItem('kalu_balance');
    return saved ? parseFloat(saved) : 0;
  });
  const [totalSalesCount, setTotalSalesCount] = useState<number>(() => {
    const saved = localStorage.getItem('kalu_sales_count');
    return saved ? parseInt(saved) : 0;
  });
  const [totalSalesRevenue, setTotalSalesRevenue] = useState<number>(() => {
    const saved = localStorage.getItem('kalu_sales_revenue');
    return saved ? parseFloat(saved) : 0;
  });

  


  // Real-time Local API Listeners -> Local Listeners
  useEffect(() => {
    fetchLocalProducts().then(data => {
      if (data && data.length) setCheeseProducts(data);
    }).catch(e => console.error("Error loading local products:", e));

    const unsubTransactions = onCollectionSnapshot('transactions', (data) => {
      if (data && data.length > 0) {
        const txs = data as Transaction[];
        txs.sort((a, b) => {
          if (a.id > b.id) return -1;
          if (a.id < b.id) return 1;
          return 0;
        });
        setTransactions(txs);
      } else {
        const saved = localStorage.getItem('kalu_sales_history');
        if (saved) {
           const parsed = JSON.parse(saved);
           if (parsed.length > 0) {
              setTransactions(parsed);
              parsed.forEach((t: any) => addLocalDoc('transactions', t).catch(console.error));
           }
        }
      }
    });

    const unsubClients = onCollectionSnapshot('clients', (data) => {
      if (data && data.length > 0) {
         setClients(data as ClientProfile[]);
      } else {
         const saved = localStorage.getItem('kalu_clients');
         if (saved) {
            const localData = JSON.parse(saved);
            if (localData && localData.length > 0) {
               setClients(localData);
               localData.forEach((c: any) => addLocalDoc('clients', c).catch(console.error));
            } else {
               setClients(INITIAL_CLIENTS);
            }
         } else {
            setClients(INITIAL_CLIENTS);
         }
      }
    });

    const unsubCheeseTrips = onCollectionSnapshot('cheeseTrips', (data) => {
      const trips = data as CheeseTrip[];
      trips.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCheeseTrips(trips);
    });

    const unsubSuppliers = onCollectionSnapshot('suppliers', (data) => {
      if (data && data.length > 0) {
         setSuppliers(data as SupplierProfile[]);
      } else {
         const saved = localStorage.getItem('kalu_suppliers');
         if (saved) {
            const localData = JSON.parse(saved);
            if (localData && localData.length > 0) {
               setSuppliers(localData);
               localData.forEach((s: any) => addLocalDoc('suppliers', s).catch(console.error));
            } else {
               setSuppliers(INITIAL_SUPPLIERS);
            }
         } else {
            setSuppliers(INITIAL_SUPPLIERS);
         }
      }
    });

    const unsubSettings = onCollectionSnapshot('settings', (data) => {
      const generalDoc = data.find((d: any) => d.id === 'general');
      if (generalDoc) {
        let newSettings = { ...DEFAULT_SETTINGS, ...generalDoc } as BusinessSettings;
        
        // MIGRATION LOGIC: If centralVaultBalance is empty but we have sabanotaInitials
        if (!generalDoc.centralVaultBalance && generalDoc.sabanotaInitials) {
          const exchangeRate = generalDoc.exchangeRate || 45;
          newSettings.centralVaultBalance = {
            usd: Number(generalDoc.sabanotaInitials.drawerUsd) || 0,
            bs: Number(generalDoc.sabanotaInitials.drawerBs) || 0,
            bankBs: Number(generalDoc.sabanotaInitials.bankBalanceBs) || 0,
            bankUsd: Number(generalDoc.sabanotaInitials.bankBalanceUsd) || (Number(generalDoc.sabanotaInitials.bankBalanceBs || 0) / exchangeRate)
          };
        }
        setSettings(newSettings);
      }
    });

    const unsubUsers = onCollectionSnapshot('users', (data) => {
      setUsers(data as UserIdentity[]);
    });

    return () => {
      unsubTransactions();
      unsubClients();
      unsubSuppliers();
      unsubSettings();
      unsubUsers();
      unsubCheeseTrips();
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
    localStorage.setItem('kalu_auth_state', 'true');
    localStorage.setItem('kalu_current_user', JSON.stringify(user));
    if (targetView) {
      setCurrentView(targetView);
    } else {
      setCurrentView('pos-terminal');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentView('portal-dashboard');
    localStorage.removeItem('kalu_auth_state');
    localStorage.removeItem('kalu_current_user');
  };

  // ERP STATE MODIFIERS

  // 1. Point of sale (Procesar Venta)
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

    // Decrease product stock and register Kardex movement
    setCheeseProducts((prevProducts) =>
      prevProducts.map((p) => {
        const item = saleItems.find((si) => si.productId === p.id);
        if (item) {
          const newStock = Math.max(0, p.stockKg - item.quantityKg);
          
          // Generate Kardex Movement
          const kardexMovement: KardexMovement = {
            id: crypto.randomUUID(),
            date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
            timestamp: Date.now(),
            productId: p.id,
            productName: p.name,
            unit: 'Kg',
            type: 'SALIDA_VENTA',
            quantity: item.quantityKg,
            previousStock: p.stockKg,
            newStock: newStock,
            unitCost: p.wholesalePrice || p.pricePerKg || 0,
            totalCost: item.quantityKg * (p.wholesalePrice || p.pricePerKg || 0),
            totalValue: item.subtotal,
            referenceId: `POS-${Date.now()}`,
            notes: 'Venta registrada desde el POS'
          };
          
          // Persist to Local API immediately
          updateLocalDoc('products', p.id, { stockKg: newStock }).catch(e => console.error("Error updating stock", e));
          addLocalDoc('kardex', kardexMovement).catch(e => console.error("Error saving kardex", e));
          
          return { ...p, stockKg: newStock };
        }
        return p;
      })
    );

    let customerName = 'Cliente de Mostrador';

    // If client credit was used
    if (clientId) {
      const selectedClient = clients.find(c => c.id === clientId);
      if (selectedClient) {
        customerName = selectedClient.name;
      }
      setClients((prevClients) =>
        prevClients.map((c) => {
          if (c.id === clientId) {
            const addedPoints = Math.round(saleTotal * 0.1);
            let updatedClient;
            const isCreditType = paymentMethodType === 'credit' || paymentMethodType === 'Crédito' || paymentMethodType === 'Crédito / Fiado' || paymentMethodType === 'Libreta de Queso';
            if (isCreditType) {
              updatedClient = {
                ...c,
                outstandingDebt: Number(c.outstandingDebt || 0) + debtAmount,
                loyaltyPoints: Number(c.loyaltyPoints || 0) + addedPoints
              };
            } else {
              updatedClient = {
                ...c,
                loyaltyPoints: Number(c.loyaltyPoints || 0) + addedPoints
              };
            }
            // Persist client updates to Local API
            updateLocalDoc('clients', clientId, { 
              outstandingDebt: updatedClient.outstandingDebt,
              loyaltyPoints: updatedClient.loyaltyPoints
            }).catch(e => console.error("Error updating client", e));
            return updatedClient;
          }
          return c;
        })
      );

      const isCreditTypeForBill = paymentMethodType === 'credit' || paymentMethodType === 'Crédito' || paymentMethodType === 'Crédito / Fiado' || paymentMethodType === 'Libreta de Queso';
      if (isCreditTypeForBill && debtAmount > 0) {
        const newBill: AccountBill = {
          id: `bill-rcv-${Date.now()}`,
          type: 'receivable',
          entityId: clientId,
          entityName: customerName,
          amount: debtAmount,
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
          status: 'Pendiente',
          notes: `Consumo de tienda a crédito`
        };
        setBills((prev) => [newBill, ...prev]);
      }
    } else if (supplierId) {
      const selectedSup = suppliers.find(s => s.id === supplierId);
      if (selectedSup) {
        customerName = `${selectedSup.name} (Productor)`;
      }
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

            // Persist supplier debt updates to Local API
            updateLocalDoc('suppliers', supplierId, {
              storeDebt: newStoreDebt,
              balanceOwed: newBalanceOwed
            }).catch(e => console.error("Error updating supplier store debt", e));
            
            return {
              ...s,
              storeDebt: newStoreDebt,
              balanceOwed: newBalanceOwed
            };
          }
          return s;
        })
      );

      if (debtAmount > 0) {
        const newBill: AccountBill = {
          id: `bill-rcv-sup-${Date.now()}`,
          type: 'receivable',
          entityId: supplierId,
          entityName: selectedSup ? selectedSup.name : 'Productor de Queso',
          amount: debtAmount,
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
          status: 'Pendiente',
          notes: `Consumo de tienda (Libreta de Queso)`
        };
        setBills((prev) => [newBill, ...prev]);

        // Generar asiento en el historial del quesero para el fiado de tienda
        if (selectedSup) {
          const supTxId = `TX-POS-SUP-${Date.now()}`;
          const supTx: Transaction = {
            id: supTxId,
            entity: selectedSup.name,
            category: 'credito',
            date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
            invoiceNumber: `POS-${Math.floor(Math.random() * 9000 + 1000)}`,
            amount: debtAmount,
            isIncome: false, // RESTA (-)
            status: 'Completado',
            paymentMethod: 'Consumo de Tienda',
            notes: 'Consumo / Fiado de víveres en tienda',
            items: saleItems
          };
          
          addLocalDoc('transactions', supTx).catch(e => console.error("Error al registrar fiado en historial de quesero", e));
        }
      }
    }

    // Update global finance values (add the cash portion to liquid balance)
    setBalance((prev) => prev + amountPaid);
    setTotalSalesRevenue((prev) => prev + saleTotal);
    setTotalSalesCount((prev) => prev + 1);

    // Determine the precise payment method string
    let finalPaymentMethod = paymentMethodType || 'Efectivo';
    if (debtAmount > 0 && paidAmount === 0) {
      finalPaymentMethod = supplierId ? 'Libreta Quesero' : 'Crédito / Fiado';
    } else if (debtAmount > 0 && paidAmount! > 0) {
      finalPaymentMethod = `Multipago (Efectivo + ${supplierId ? 'Libreta' : 'Crédito'})`;
    }

    // Add general transaction record
    const newTx: Transaction = {
      id: `TX-${Date.now()}`,
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
      items: saleItems, // Saving items to show in the ticket later
      addedPayments: addedPayments || [],
      changeAmount: changeAmount || 0,
      changeCurrency: (changeCurrency as 'USD' | 'BS' | 'PAGO_MOVIL' | 'MIXED') || 'USD',
      changeReference: changeReference || '',
      mixedChange: mixedChange || null,
      changeBs: changeBs || 0,
      bcvRateAtSettlement: bcvRateAtSettlement || settings.exchangeRate || 42.50
    };
    
    // Save to Local State immediately (which triggers localStorage backup)
    setTransactions((prev) => [newTx, ...prev]);

    // Eliminar cualquier valor undefined restante para evitar el fallo silencioso de Local API
    const sanitizedTx = { ...newTx };
    Object.keys(sanitizedTx).forEach(key => {
      if ((sanitizedTx as any)[key] === undefined) {
        delete (sanitizedTx as any)[key];
      }
    });

    // Save to Local API so it syncs globally and doesn't get overwritten by the listener
    try {
      await addLocalDoc('transactions', sanitizedTx);
    } catch (err) {
      console.error("Error saving transaction to Local API:", err);
    }

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

    // 3. Return stock to inventory
    items.forEach(async (item) => {
      const p = cheeseProducts.find(p => p.id === item.id);
      if (p) {
        setCheeseProducts(prev => prev.map(prod => prod.id === item.id ? { ...prod, stockKg: prod.stockKg + item.quantity } : prod));
        try {
          // Import increment if not present, but it's already used below
                    await updateLocalDoc('products', item.id, { stockKg: (cheeseProducts.find(p => p.id === item.id)?.stockKg || 0) + item.quantity });
        } catch (e) {
          console.error('Failed to return stock', e);
        }
      }
    });

    // 4. Update financials
    const tx = transactions.find(t => t.id === transactionId);
    if (tx) {
      setBalance(prev => prev - (tx.amount || 0));
      setTotalSalesRevenue(prev => prev - (tx.amount || 0));
      setTotalSalesCount(prev => prev - 1);
      
      const newAct: ActivityStream = {
        id: `act-void-${Date.now()}`,
        title: 'Venta Anulada',
        detail: `Se anuló la transacción ${transactionId} por $${(tx.amount || 0).toFixed(2)}`,
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
        unit: prod.unit || 'Kg',
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
      await addLocalDoc('trips', newTrip);

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
          unit: prod.unit || 'Kg',
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

      addNotification('Viaje San Juan registrado con éxito', 'success');
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


      // If there was a client assigned to the trip, we reduce their debt by the total settlement value (total returned goods + money)
      // Actually, let's just reduce the client debt by the total settled amount (Total Liquidado = Mercancía + Dinero)
      const trip = cheeseTrips.find(t => t.id === tripId);
      if (trip && trip.clientId && settlementData.totalSettlementValueUsd) {
        await updateLocalDoc('clients', trip.clientId, {
          outstandingDebt: (clients.find(c => c.id === trip.clientId)?.outstandingDebt || 0) - (settlementData.totalSettlementValueUsd || 0)
        });
      }

      addNotification('Viaje liquidado y bóveda actualizada', 'success');
    } catch (err) {
      console.error('Error settling trip:', err);
      addNotification('Error al liquidar el viaje', 'warning');
    }
  };

  // Libreta de Queso Handlers
  const handleRecordSupplierStorePayment = (supplierId: string, amount: number, method: string = 'Efectivo / Caja Chica', note: string = '', currency: 'USD' | 'VES' = 'USD') => {
    setSuppliers((prev) =>
      prev.map((s) => {
        if (s.id === supplierId) {
          const currentDebt = s.storeDebt || 0;
          return { ...s, storeDebt: Math.max(0, currentDebt - amount) };
        }
        return s;
      })
    );

    const sup = suppliers.find(s => s.id === supplierId);
    if (sup) {
      updateLocalDoc('suppliers', supplierId, {
        storeDebt: Math.max(0, (sup.storeDebt || 0) - amount)
      }).catch(e => console.error("Error updating supplier store debt", e));
    }

    const currentVault = settings.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };
    const updatedVault = { ...currentVault };
    
    if (currency === 'VES') {
      const bsAmount = amount * (settings.exchangeRate || 42.50);
      if (method === 'Efectivo / Caja Chica') {
         updatedVault.bs = (updatedVault.bs || 0) + bsAmount;
      } else {
         updatedVault.bankBs = (updatedVault.bankBs || 0) + bsAmount;
      }
    } else {
      if (method === 'Efectivo / Caja Chica') {
         updatedVault.usd = (updatedVault.usd || 0) + amount;
      } else {
         updatedVault.bankUsd = (updatedVault.bankUsd || 0) + amount;
      }
    }
    
    handleUpdateSettings({ centralVaultBalance: updatedVault });

    const newTx: Transaction = {
      id: `TX-${Date.now().toString().slice(-4)}`,
      entity: sup ? sup.name : 'Productor',
      category: 'ingresos_cobranza',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: `COB-PROD-${Math.floor(Math.random() * 9000 + 1000)}`,
      amount: amount,
      isIncome: true,
      status: 'Completado',
      paymentMethod: method,
      notes: note || 'Abono a deuda de tienda'
    };
    
    setTransactions((prev) => [newTx, ...prev]);

    try {
      addLocalDoc('transactions', newTx);
    } catch (err) {
      console.error("Error saving supplier transaction to Local API:", err);
    }
  };

  const handleNetSupplierBalances = (supplierId: string) => {
    const sup = suppliers.find(s => s.id === supplierId);
    if (!sup) return;

    const owedToThem = sup.balanceOwed;
    const owedToUs = sup.storeDebt || 0;

    if (owedToThem === 0 && owedToUs === 0) {
      addNotification('No hay saldos pendientes en la libreta para compensar.', 'info');
      return;
    }

    let newBalanceOwed = 0;
    let newStoreDebt = 0;

    if (owedToThem >= owedToUs) {
      newBalanceOwed = owedToThem - owedToUs;
      newStoreDebt = 0;
    } else {
      newBalanceOwed = 0;
      newStoreDebt = owedToUs - owedToThem;
    }

    setSuppliers((prev) =>
      prev.map((s) => {
        if (s.id === supplierId) {
          return {
            ...s,
            balanceOwed: newBalanceOwed,
            storeDebt: newStoreDebt
          };
        }
        return s;
      })
    );
    
    // Save to Firestore
    try {
      updateLocalDoc('suppliers', supplierId, {
        balanceOwed: newBalanceOwed,
        storeDebt: newStoreDebt
      });
    } catch (err) {
      console.error("Error updating supplier net balances in Local API:", err);
    }

    // Adjust bills
    setBills((prevBills) => {
      // Create a copy of the bills, and set matched pending ones of both types as 'Pagado' or adjust them
      // This is a simulation, let's mark equivalent bills as Paid or add an adjustment note
      return prevBills;
    });

    const netAmount = Math.min(owedToThem, owedToUs);
    const newTx: Transaction = {
      id: `TX-${Date.now()}`,
      entity: `Compensación Libreta: ${sup.name}`,
      category: 'credito',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: `NET-${Math.floor(Math.random() * 9000 + 1000)}`,
      amount: netAmount,
      isIncome: true,
      status: 'Completado'
    };
    setTransactions((prev) => [newTx, ...prev]);

    try {
      addLocalDoc('transactions', newTx);
    } catch (err) {
      console.error("Error saving net transaction to Local API:", err);
    }

    addNotification(`Intercambio en Libreta de Queso: Se han compensado $${netAmount.toLocaleString()} M.N. de deudas cruzadas.`, 'success');
  };

  const handlePaySupplierRemainingBalance = async (supplierId: string, amount: number, paymentSource: string, note?: string, currency: 'USD' | 'VES' = 'USD') => {
    const sup = suppliers.find(s => s.id === supplierId);
    if (!sup) return;
    const newBalance = Math.max(0, sup.balanceOwed - amount);
    
    setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, balanceOwed: newBalance } : s));

    try {
      await updateLocalDoc('suppliers', supplierId, { balance: newBalance, debt: newBalance, balanceOwed: newBalance });
    } catch (err) {
      console.error("Error updating supplier balance in Local API:", err);
    }

    if (paymentSource !== 'Dejar como Saldo Pendiente') {
      // Deduzca de bóveda central en Firestore
      const currentVault = settings.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };
      const updatedVault = { ...currentVault };
      
      if (currency === 'VES') {
        const bsAmount = amount * (settings.exchangeRate || 42.50);
        if (paymentSource === 'Efectivo / Caja Chica') {
           updatedVault.bs = (updatedVault.bs || 0) - bsAmount;
        } else {
           updatedVault.bankBs = (updatedVault.bankBs || 0) - bsAmount;
        }
      } else {
        if (paymentSource === 'Efectivo / Caja Chica') {
           updatedVault.usd = (updatedVault.usd || 0) - amount;
        } else {
           updatedVault.bankUsd = (updatedVault.bankUsd || 0) - amount;
        }
      }
      
      handleUpdateSettings({ centralVaultBalance: updatedVault });

      const newTx: Transaction = {
        id: `TX-${Date.now()}`,
        entity: sup.name,
        category: 'compras',
        date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        invoiceNumber: `PAG-NET-${Math.floor(Math.random() * 9000 + 1000)}`,
        amount: amount,
        isIncome: false,
        status: 'Completado',
        notes: note || `Pago de saldo. Fuente: ${paymentSource}`,
        paymentMethod: paymentSource
      };
      setTransactions(prev => [newTx, ...prev]);
      try {
        addLocalDoc('transactions', newTx);
      } catch (err) {
        console.error("Error saving payment to Local API:", err);
      }
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
    items: { productId: string; quantityKg: number; purchasePrice: number; sellingPrice: number; marginPercent: number; name: string; createNewItem?: boolean; }[];
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
        totalCost += (item.quantityKg || 0) * (item.purchasePrice || 0);

        let prod = cheeseProducts.find(p => p.id === item.productId);

        if (!prod) {
          const newProd: CheeseProduct = {
            id: crypto.randomUUID(),
            name: item.name || 'Producto Nuevo (IA)',
            category: 'Fresco', // Default or guess
            stockKg: item.quantityKg,
            purchasePrice: item.purchasePrice,
            sellingPrice: item.sellingPrice || 0,
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
            stockKg: (cheeseProducts.find(p => p.id === prod.id)?.stockKg || 0) + Number(item.quantityKg),
            purchasePrice: item.purchasePrice,
            sellingPrice: item.sellingPrice > 0 ? item.sellingPrice : (prod.sellingPrice || 0)
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
            unit: prod.unit || 'Kg',
            type: 'ENTRADA_COMPRA',
            quantity: Number(item.quantityKg),
            previousStock: currentStock,
            newStock: currentStock + Number(item.quantityKg),
            unitCost: Number(item.purchasePrice),
            totalCost: Number(item.purchasePrice * item.quantityKg),
            referenceId: purchaseTxId,
            userOrCashier: 'Sistema de Compras'
          };
          await addLocalDoc('kardex', kardexMovement);
        }
      }

      // --- CUENTAS POR PAGAR (FIADO) - SIN CRUCES COMERCIALES ---
      let newBalanceOwed = selectedSup.balanceOwed || 0;
      const newStoreDebt = selectedSup.storeDebt || 0; // Se mantiene intacta

      newBalanceOwed += totalCost;

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

      addNotification('Compra recibida, inventario actualizado y movimientos de Kardex registrados', 'success');
    } catch (err) {
      console.error('Error saving purchase to DB:', err);
      addNotification('Error crítico al guardar la compra en base de datos', 'warning');
      return;
    }

    // Increase product stock and update prices in LOCAL STATE for React reactivity
    setCheeseProducts((prev) => {
      const nextProducts = [...prev];
      purchase.items.forEach(item => {
        const pIndex = nextProducts.findIndex(p => p.id === item.productId);
        if (pIndex !== -1) {
          nextProducts[pIndex] = {
            ...nextProducts[pIndex],
            stockKg: nextProducts[pIndex].stockKg + Number(item.quantityKg),
            purchasePrice: Number(item.purchasePrice),
            sellingPrice: item.sellingPrice > 0 ? item.sellingPrice : nextProducts[pIndex].sellingPrice
          };
        }
      });
      return nextProducts;
    });

    const txItems = purchase.items.map(i => ({
      name: i.name,
      kg: Number(i.quantityKg),
      pricePerKg: Number(i.purchasePrice),
      totalUsd: Number(i.quantityKg * i.purchasePrice),
      totalBs: Number((i.quantityKg * i.purchasePrice) * (settings.exchangeRate || 42.50))
    }));

    // Generate transaction for Ledger ('Entrega')
    // Toda compra comercial va a cuentas por pagar obligatoriamente.
    const newTx: Transaction = {
      id: `TX-${Date.now()}`,
      entity: selectedSup.name,
      category: 'compras',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: purchaseTxId,
      amount: totalCost,
      isIncome: true, // Mark as income so ledger reads it as sum (+)
      status: 'Completado',
      notes: `Recibido ${purchase.items.map(i=>i.quantityKg + 'kg').join(', ')}. Carga a Cuentas por Pagar.`,
      items: txItems
    };
    
    setTransactions((prev) => [newTx, ...prev]);
    try {
      addLocalDoc('transactions', newTx);
    } catch (e) { console.error(e); }

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

  // 5. Clients & Credit repayments
  const handleAddClient = async (client: Omit<ClientProfile, 'id' | 'outstandingDebt' | 'loyaltyPoints'>) => {
    const newCli: ClientProfile = {
      ...client,
      id: `cli-${Date.now()}`,
      outstandingDebt: 0,
      loyaltyPoints: 10
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
    // Decrement client outstandingDebt
    setClients((prev) =>
      prev.map((c) => {
        if (c.id === clientId) {
          return { ...c, outstandingDebt: Math.max(0, c.outstandingDebt - amount) };
        }
        return c;
      })
    );

    // Mark corresponding Client Bill as paid if it balances out
    setBills((prevBills) => {
      let remainingPayment = amount;
      return prevBills.map((b) => {
        if (b.type === 'receivable' && b.entityId === clientId && b.status === 'Pendiente') {
          if (remainingPayment >= b.amount) {
            remainingPayment -= b.amount;
            return { ...b, status: 'Pagado' };
          }
        }
        return b;
      });
    });

    // Increment business balance
    setBalance((prev) => prev + amount);

    // Create a transaction record
    const selectedClient = clients.find(c => c.id === clientId);
    const newTx: Transaction = {
      id: `TX-${Date.now().toString().slice(-4)}`,
      entity: selectedClient ? selectedClient.name : 'Cobro de Cuenta',
      category: 'credito',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: `REC-${Math.floor(Math.random() * 9000 + 1000)}`,
      amount: amount,
      isIncome: true,
      status: 'Completado',
      paymentMethod: paymentMethod,
      notes: notes || 'Abono de Cuenta por Cobrar'
    };
    setTransactions((prev) => [newTx, ...prev]);

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
      balanceOwed: 0
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
          return { ...s, balanceOwed: Math.max(0, s.balanceOwed - amount) };
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
      category: 'compras',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: `PAGO-${Math.floor(Math.random() * 9000 + 1000)}`,
      amount: amount,
      isIncome: false,
      status: 'Completado'
    };
    setTransactions((prev) => [newTx, ...prev]);
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


  const urlParams = new URLSearchParams(window.location.search);
  const portalParam = urlParams.get('portal');
  const portalId = urlParams.get('id');
  const adminParam = urlParams.get('admin');

  // Show ERP if admin is explicitly requested, or if already authenticated and no portal was explicitly requested
  const showErp = adminParam === 'true' || (isAuthenticated && !portalParam);

  if (!showErp) {
    const effectiveType = (portalParam === 'productor' || portalParam === 'proveedor' || portalParam === 'contador') ? portalParam : 'cliente';
    return (
      <div className="min-h-screen bg-black text-white">
        <MobilePortalsView
          products={cheeseProducts}
          clients={clients}
          suppliers={suppliers}
          mobileOrders={mobileOrders}
          onAddMobileOrder={handleAddMobileOrder}
          onDeliverMobileOrder={handleDeliverMobileOrder}
          onCancelMobileOrder={handleCancelMobileOrder}
          onAddNotification={addNotification}
          isolatedType={effectiveType as any}
          isolatedId={portalId || undefined}
        />
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
              exchangeRate={42.50}
              onAddSupplier={handleAddSupplier}
              onUpdateSupplier={handleUpdateSupplier}
              onPaySupplierBill={handlePaySupplierBill}
              onRecordSupplierStorePayment={handleRecordSupplierStorePayment}
              onNetSupplierBalances={handleNetSupplierBalances}
              onPaySupplierRemainingBalance={handlePaySupplierRemainingBalance}
              onLoadPurchase={handleLoadPurchase}
              onAddNotification={addNotification}
            />
          )}

          {currentView === 'finances' && (
            <FinancesAnalysisView
              expenses={expenses}
              transactions={transactions}
              businessBalance={balance}
              totalSalesRevenue={totalSalesRevenue}
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

          {currentView === 'mobile-portals' && (
            <MobilePortalsView
              products={cheeseProducts}
              clients={clients}
              suppliers={suppliers}
              mobileOrders={mobileOrders}
              onAddMobileOrder={handleAddMobileOrder}
              onDeliverMobileOrder={handleDeliverMobileOrder}
              onCancelMobileOrder={handleCancelMobileOrder}
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
              transactions={transactions}
              onCreateTrip={handleCreateTrip}
              onUpdateTrip={handleUpdateTrip}
              onSettleTrip={handleSettleTrip}
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
                 const newTx: Transaction = {
                   id: `TX-${Date.now().toString().slice(-4)}`,
                   entity: 'Bóveda Banco Central',
                   date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
                   invoiceNumber: `BOV-${Math.floor(Math.random() * 9000 + 1000)}`,
                   status: 'Completado',
                   ...tx
                 } as Transaction;
                 
                 setTransactions(prev => [newTx, ...prev]);
                 try {
                   addLocalDoc('transactions', newTx);
                 } catch (e) {
                   console.error(e);
                 }

                 const currentVault = settings.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };
                 const updatedVault = { ...currentVault };
                 
                 if (tx.isIncome) {
                    if (tx.paymentMethod === 'Efectivo' || tx.paymentMethod === 'Efectivo USD') updatedVault.usd += (tx.amount || 0);
                    else if (tx.paymentMethod === 'Efectivo BS') updatedVault.bs += (tx.amount || 0);
                    else updatedVault.bankUsd += (tx.amount || 0);
                 } else {
                    if (tx.paymentMethod === 'Efectivo' || tx.paymentMethod === 'Efectivo USD') updatedVault.usd -= (tx.amount || 0);
                    else if (tx.paymentMethod === 'Efectivo BS') updatedVault.bs -= (tx.amount || 0);
                    else updatedVault.bankUsd -= (tx.amount || 0);
                 }
                 
                 handleUpdateSettings({ centralVaultBalance: updatedVault });
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
