import React, { useState, useEffect, useCallback } from 'react';
import {
  CheeseProduct,
  ClientProfile,
  SupplierProfile,
  MobileOrder,
  CheeseTrip,
  Transaction,
  BusinessSettings,
  CheeseLedgerBatch,
  OperatingExpense,
  CustomerComplaint,
  UserIdentity,
  PaymentMethod,
  ActivityStream
} from '../types';
import {
  INITIAL_CHEESE_PRODUCTS,
  INITIAL_CHEESE_BATCHES,
  INITIAL_CLIENTS,
  INITIAL_SUPPLIERS,
  INITIAL_OPERATING_EXPENSES,
  INITIAL_COMPLAINTS,
  INITIAL_TRANSACTIONS,
  INITIAL_USERS,
  INITIAL_PAYMENT_METHODS,
  INITIAL_ACTIVITIES,
  DEFAULT_SETTINGS
} from '../data';
import {
  onCollectionSnapshot,
  addLocalDoc,
  updateLocalDoc
} from '../services/localApi';
import { fetchLocalProducts } from '../services/productApi';

export interface SharedDataState {
  // Entidades principales
  products: CheeseProduct[];
  clients: ClientProfile[];
  suppliers: SupplierProfile[];
  mobileOrders: MobileOrder[];
  cheeseTrips: CheeseTrip[];
  transactions: Transaction[];
  settings: BusinessSettings;

  // Entidades complementarias de CRM
  cheeseBatches: CheeseLedgerBatch[];
  expenses: OperatingExpense[];
  complaints: CustomerComplaint[];
  users: UserIdentity[];
  paymentMethods: PaymentMethod[];
  activities: ActivityStream[];

  // Setters directos para mutaciones en memoria/UI
  setProducts: React.Dispatch<React.SetStateAction<CheeseProduct[]>>;
  setClients: React.Dispatch<React.SetStateAction<ClientProfile[]>>;
  setSuppliers: React.Dispatch<React.SetStateAction<SupplierProfile[]>>;
  setMobileOrders: React.Dispatch<React.SetStateAction<MobileOrder[]>>;
  setCheeseTrips: React.Dispatch<React.SetStateAction<CheeseTrip[]>>;
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  setSettings: React.Dispatch<React.SetStateAction<BusinessSettings>>;
  setCheeseBatches: React.Dispatch<React.SetStateAction<CheeseLedgerBatch[]>>;
  setExpenses: React.Dispatch<React.SetStateAction<OperatingExpense[]>>;
  setComplaints: React.Dispatch<React.SetStateAction<CustomerComplaint[]>>;
  setUsers: React.Dispatch<React.SetStateAction<UserIdentity[]>>;
  setActivities: React.Dispatch<React.SetStateAction<ActivityStream[]>>;

  // Acciones comunes de pedidos móviles
  addMobileOrder: (order: MobileOrder) => Promise<void>;
  deliverMobileOrder: (orderId: string) => Promise<void>;
  cancelMobileOrder: (orderId: string) => Promise<void>;
}

export function useSharedData(): SharedDataState {
  // 1. Estados inicializados con localStorage fallback + default mockups
  const [products, setProducts] = useState<CheeseProduct[]>(() => {
    try {
      const saved = localStorage.getItem('kalu_inventory');
      return saved ? JSON.parse(saved) : INITIAL_CHEESE_PRODUCTS;
    } catch {
      return INITIAL_CHEESE_PRODUCTS;
    }
  });

  const [clients, setClients] = useState<ClientProfile[]>(() => {
    try {
      const saved = localStorage.getItem('kalu_clients');
      return saved ? JSON.parse(saved) : INITIAL_CLIENTS;
    } catch {
      return INITIAL_CLIENTS;
    }
  });

  const [suppliers, setSuppliers] = useState<SupplierProfile[]>(() => {
    try {
      const saved = localStorage.getItem('kalu_suppliers');
      return saved ? JSON.parse(saved) : INITIAL_SUPPLIERS;
    } catch {
      return INITIAL_SUPPLIERS;
    }
  });

  const [mobileOrders, setMobileOrders] = useState<MobileOrder[]>([]);

  const [cheeseTrips, setCheeseTrips] = useState<CheeseTrip[]>(() => {
    try {
      const saved = localStorage.getItem('kalu_cheese_trips');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('kalu_sales_history');
      return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
    } catch {
      return INITIAL_TRANSACTIONS;
    }
  });

  const [settings, setSettings] = useState<BusinessSettings>(() => {
    try {
      const saved = localStorage.getItem('kalu_settings');
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [cheeseBatches, setCheeseBatches] = useState<CheeseLedgerBatch[]>(() => {
    try {
      const saved = localStorage.getItem('kalu_batches');
      return saved ? JSON.parse(saved) : INITIAL_CHEESE_BATCHES;
    } catch {
      return INITIAL_CHEESE_BATCHES;
    }
  });

  const [expenses, setExpenses] = useState<OperatingExpense[]>(() => {
    try {
      const saved = localStorage.getItem('kalu_expenses');
      return saved ? JSON.parse(saved) : INITIAL_OPERATING_EXPENSES;
    } catch {
      return INITIAL_OPERATING_EXPENSES;
    }
  });

  const [complaints, setComplaints] = useState<CustomerComplaint[]>(INITIAL_COMPLAINTS);
  const [users, setUsers] = useState<UserIdentity[]>(() => {
    try {
      const saved = localStorage.getItem('kalu_users');
      return saved ? JSON.parse(saved) : INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  });
  const [paymentMethods] = useState<PaymentMethod[]>(INITIAL_PAYMENT_METHODS);
  const [activities, setActivities] = useState<ActivityStream[]>(() => {
    try {
      const saved = localStorage.getItem('kalu_activities');
      return saved ? JSON.parse(saved) : INITIAL_ACTIVITIES;
    } catch {
      return INITIAL_ACTIVITIES;
    }
  });

  // 2. Suscripciones Reactivas en Tiempo Real (Local WebSocket + REST API)
  useEffect(() => {
    // Carga de productos locales
    fetchLocalProducts()
      .then((data) => {
        if (data && data.length) {
          setProducts(data);
        }
      })
      .catch((e) => console.error('[useSharedData] Error al cargar productos locales:', e));

    // Listeners reactivos de colecciones
    const unsubProducts = onCollectionSnapshot('products', (data) => {
      if (data && data.length > 0) {
        setProducts(data as CheeseProduct[]);
      }
    });

    const unsubTransactions = onCollectionSnapshot('transactions', (data) => {
      if (data && data.length > 0) {
        const txs = data as Transaction[];
        txs.sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));
        setTransactions(txs);
      } else {
        const saved = localStorage.getItem('kalu_sales_history');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.length > 0) {
              setTransactions(parsed);
              parsed.forEach((t: any) => addLocalDoc('transactions', t).catch(console.error));
            }
          } catch (e) {
            console.error('[useSharedData] Error parsing sales history:', e);
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
          try {
            const localData = JSON.parse(saved);
            if (localData && localData.length > 0) {
              setClients(localData);
              localData.forEach((c: any) => addLocalDoc('clients', c).catch(console.error));
            } else {
              setClients(INITIAL_CLIENTS);
            }
          } catch {
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
          try {
            const localData = JSON.parse(saved);
            if (localData && localData.length > 0) {
              setSuppliers(localData);
              localData.forEach((s: any) => addLocalDoc('suppliers', s).catch(console.error));
            } else {
              setSuppliers(INITIAL_SUPPLIERS);
            }
          } catch {
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
        if (!generalDoc.centralVaultBalance && generalDoc.sabanotaInitials) {
          newSettings.centralVaultBalance = {
            usd: Number(generalDoc.sabanotaInitials.drawerUsd) || 0,
            bs: Number(generalDoc.sabanotaInitials.drawerBs) || 0,
            bankBs: Number(generalDoc.sabanotaInitials.bankBalanceBs) || 0,
            bankUsd: Number(generalDoc.sabanotaInitials.bankBalanceUsd) || 0
          };
        }
        setSettings(newSettings);
      }
    });

    const unsubUsers = onCollectionSnapshot('users', (data) => {
      if (data && data.length > 0) {
        setUsers(data as UserIdentity[]);
      }
    });

    const unsubMobileOrders = onCollectionSnapshot('mobileOrders', (data) => {
      if (data) {
        setMobileOrders(data as MobileOrder[]);
      }
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

  // 3. Persistencia automática en LocalStorage (Offline Resilience)
  useEffect(() => {
    localStorage.setItem('kalu_inventory', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('kalu_clients', JSON.stringify(clients));
  }, [clients]);

  useEffect(() => {
    localStorage.setItem('kalu_suppliers', JSON.stringify(suppliers));
  }, [suppliers]);

  useEffect(() => {
    localStorage.setItem('kalu_sales_history', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('kalu_cheese_trips', JSON.stringify(cheeseTrips));
  }, [cheeseTrips]);

  useEffect(() => {
    localStorage.setItem('kalu_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('kalu_batches', JSON.stringify(cheeseBatches));
  }, [cheeseBatches]);

  useEffect(() => {
    localStorage.setItem('kalu_expenses', JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    localStorage.setItem('kalu_activities', JSON.stringify(activities));
  }, [activities]);

  // 4. Métodos Compartidos de Lectura/Escritura para Pedidos Móviles
  const addMobileOrder = useCallback(async (order: MobileOrder) => {
    setMobileOrders((prev) => [order, ...prev]);
    try {
      await addLocalDoc('mobileOrders', order);
    } catch (err) {
      console.error('[useSharedData] Error al guardar pedido móvil:', err);
    }
  }, []);

  const deliverMobileOrder = useCallback(async (orderId: string) => {
    setMobileOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'Completado' } : o))
    );
    try {
      await updateLocalDoc('mobileOrders', orderId, { status: 'Completado' });
    } catch (err) {
      console.error('[useSharedData] Error al completar pedido móvil:', err);
    }
  }, []);

  const cancelMobileOrder = useCallback(async (orderId: string) => {
    setMobileOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'Cancelado' } : o))
    );
    try {
      await updateLocalDoc('mobileOrders', orderId, { status: 'Cancelado' });
    } catch (err) {
      console.error('[useSharedData] Error al cancelar pedido móvil:', err);
    }
  }, []);

  return {
    products,
    clients,
    suppliers,
    mobileOrders,
    cheeseTrips,
    transactions,
    settings,
    cheeseBatches,
    expenses,
    complaints,
    users,
    paymentMethods,
    activities,
    setProducts,
    setClients,
    setSuppliers,
    setMobileOrders,
    setCheeseTrips,
    setTransactions,
    setSettings,
    setCheeseBatches,
    setExpenses,
    setComplaints,
    setUsers,
    setActivities,
    addMobileOrder,
    deliverMobileOrder,
    cancelMobileOrder
  };
}
