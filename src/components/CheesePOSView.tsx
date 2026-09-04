import React, { useState, useRef, useEffect } from 'react';
import { CheeseProduct, ClientProfile, SupplierProfile, CheeseSaleItem, MobileOrder, Transaction } from '../types';
import { ShoppingCart, Calendar, Printer, FileText, CheckCircle, RefreshCw, AlertCircle, Trash2, Plus, Minus, User, Smartphone, Zap, Archive, Eye, Banknote, Coins, CreditCard, Fingerprint, Layers, Send, RotateCcw, X, Scan, Store } from 'lucide-react';
import { parseSafeDecimal, formatCurrency, formatQuantity, getUnitLabel } from '../utils';

import { fetchCollection, addLocalDoc, updateLocalDoc, deleteLocalDoc, batchDeleteLocalDocs, onCollectionSnapshot } from '../services/localApi';

interface CheesePOSViewProps {
  exchangeRate: number;
  settings: any;
  products: CheeseProduct[];
  clients: ClientProfile[];
  suppliers: SupplierProfile[];
  mobileOrders: MobileOrder[];
  allTransactions: Transaction[];
  onProcessSale: (sale: {
    client: ClientProfile | null;
    supplier: SupplierProfile | null;
    items: CheeseSaleItem[];
    paymentMethod: string;
    total: number;
    paidAmount?: number;
    addedPayments?: any[];
    changeAmount?: number;
    changeCurrency?: 'USD' | 'BS' | 'PAGO_MOVIL' | 'MIXED';
    changeReference?: string;
    mixedChange?: any;
    changeBs?: number;
    bcvRateAtSettlement?: number;
  }) => void;
  salesHistory: any[];
  dailySalesCount: number;
  dailyRevenue: number;
  onAddNotification: (msg: string, type: 'success' | 'info' | 'warning') => void;
  onVoidSale: (transactionId: string, items: any[]) => void;
  onUpdateSettings?: (newSettings: Partial<any>) => void;
}

import { getVIPLevelInfo } from '../config/vipMatrix';

const getClientLevelPct = (points: number): number => {
  return getVIPLevelInfo(points).initialPct;
};

const getKaluInstallmentsCount = (type: 'cotidiano' | 'repuestos', points: number): number => {
  const vip = getVIPLevelInfo(points);
  if (type === 'repuestos') return vip.mainMaxInstallments;
  return vip.dailyInstallments;
};

export default function CheesePOSView({
  exchangeRate,
  settings,
  products,
  clients,
  suppliers,
  mobileOrders,
  allTransactions,
  onProcessSale,
  salesHistory,
  dailySalesCount,
  dailyRevenue,
  onAddNotification,
  onVoidSale,
  onUpdateSettings
}: CheesePOSViewProps) {
  // Helper para procesar números y precios de manera segura (Regla estricta 2)
  const parseNum = (val: any) => parseSafeDecimal(val);
  const [activeTab, setActiveTab] = useState<'pos' | 'history' | 'closing' | 'closing_history'>('pos');
  // POS Register States
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);
  const [isPedidosModalOpen, setIsPedidosModalOpen] = useState(false);
  const [changeCurrency, setChangeCurrency] = useState<'USD' | 'BS' | 'PAGO_MOVIL' | 'MIXED'>('USD');
  const [changeReference, setChangeReference] = useState('');
    const [isWaitingForApproval, setIsWaitingForApproval] = useState(false);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  
  // DIAGNOSTIC STATE
  const [approvalTimer, setApprovalTimer] = useState(40);
  const [isDiagnosticVisible, setIsDiagnosticVisible] = useState(false);
  const [diagnosticManualCheck, setDiagnosticManualCheck] = useState(false);

  React.useEffect(() => {
    let interval: any;
    if (isWaitingForApproval) {
      setApprovalTimer(40);
      setIsDiagnosticVisible(false);
      interval = setInterval(() => {
        setApprovalTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setIsDiagnosticVisible(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setApprovalTimer(40);
      setIsDiagnosticVisible(false);
    }
    return () => clearInterval(interval);
  }, [isWaitingForApproval]);
  
  const handleManualDiagnosticCheck = async () => {
    if (!pendingApprovalId) return;
    setDiagnosticManualCheck(true);
    try {
        // Usa fetch para bypassear el caché local del socket
        const res = await fetch('/api/collections/transactions').catch(() => fetch('http://localhost:3001/api/collections/transactions'));
        if (res) {
          const txs = await res.json();
          const tx = txs.find((t: any) => String(t.id) === String(pendingApprovalId));
          if (tx && tx.status === 'approved') {
              onAddNotification('Transacción aprobada en servidor. Gatillando local...', 'success');
              await updateLocalDoc('transactions', pendingApprovalId, { status: 'approved' });
          } else {
              onAddNotification(`Estado actual: ${tx?.status || 'No encontrada'}`, 'warning');
          }
        }
    } catch(e) {
        console.error(e);
        onAddNotification('Error de red al consultar.', 'warning');
    } finally {
        setDiagnosticManualCheck(false);
    }
  };

  
  const [mixedChangeUsd, setMixedChangeUsd] = useState('');
  const [mixedChangeBs, setMixedChangeBs] = useState('');
  const [mixedChangeMobile, setMixedChangeMobile] = useState('');
  const [mixedChangeMobileRef, setMixedChangeMobileRef] = useState('');
  const [transactionToVoid, setTransactionToVoid] = useState<any>(null);
  const f4LastTimeRef = useRef<number>(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        e.stopPropagation();

        if (isProcessing) {
          console.warn('[POS] Ignorando F4: Transacción en proceso.');
          return;
        }

        const now = Date.now();
        if (now - f4LastTimeRef.current < 500) {
          console.warn('[POS] Ignorando F4: Presión rápida (Debounce).');
          return;
        }
        f4LastTimeRef.current = now;

        if (isChangeModalOpen) {
          setIsChangeModalOpen(false);
          handleProcessSaleSubmit(undefined, true);
        } else if (!isPaymentModalOpen) {
          setIsPaymentModalOpen(true);
        } else if (formRef.current) {
          formRef.current.requestSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing, isPaymentModalOpen]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState<string>('0');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<CheeseSaleItem[]>(() => {
    try {
      const saved = localStorage.getItem('pos_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('pos_cart', JSON.stringify(cart));
  }, [cart]);

  const [customerType, setCustomerType] = useState<'client' | 'supplier'>('client');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [clientSearchText, setClientSearchText] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [supplierSearchText, setSupplierSearchText] = useState('');
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('Efectivo $');
  const [kaluCreditType, setKaluCreditType] = useState<'cotidiano'|'repuestos'>('cotidiano');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paidAmountInput, setPaidAmountInput] = useState<string>('');
  const [addedPayments, setAddedPayments] = useState<{ id: string; method: string; amount: number; reference: string; currency?: string; originalAmount?: number }[]>([]);
  const [isCreditSale, setIsCreditSale] = useState<boolean>(false);
  const [lastReceipt, setLastReceipt] = useState<any | null>(null);

  // Cierre de caja States
  const [startingCashUsd, setStartingCashUsd] = useState<number>(() => {
    return Number(localStorage.getItem('kalu_starting_usd')) || 0;
  });
  const [startingCashUsdInput, setStartingCashUsdInput] = useState<string>(() => {
    return String(Number(localStorage.getItem('kalu_starting_usd')) || 0);
  });
  
  const [startingCashBs, setStartingCashBs] = useState<number>(() => {
    return Number(localStorage.getItem('kalu_starting_bs')) || 0;
  });
  const [startingCashBsInput, setStartingCashBsInput] = useState<string>(() => {
    return String(Number(localStorage.getItem('kalu_starting_bs')) || 0);
  });

  // Multibarcode link states
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [barcodeLinkSearch, setBarcodeLinkSearch] = useState('');
  const [linkingBarcode, setLinkingBarcode] = useState(false);

  const handleSaveStartingCashUsd = () => {
    const val = parseSafeDecimal(startingCashUsdInput);
    setStartingCashUsd(val);
    localStorage.setItem('kalu_starting_usd', String(val));
    onAddNotification(`Fondo inicial fijado en $${val.toFixed(2)} USD`, 'success');
  };

  const handleSaveStartingCashBs = () => {
    const val = parseSafeDecimal(startingCashBsInput);
    setStartingCashBs(val);
    localStorage.setItem('kalu_starting_bs', String(val));
    onAddNotification(`Fondo inicial fijado en Bs ${val.toFixed(2)}`, 'success');
  };

  const [actualCashUsd, setActualCashUsd] = useState<number>(() => {
    return Number(localStorage.getItem('kalu_starting_usd')) || 0;
  });
  const [actualCashBs, setActualCashBs] = useState<number>(() => {
    return Number(localStorage.getItem('kalu_starting_bs')) || 0;
  });

  useEffect(() => {
    localStorage.setItem('kalu_starting_usd', startingCashUsd.toString());
  }, [startingCashUsd]);
  
  useEffect(() => {
    localStorage.setItem('kalu_starting_bs', startingCashBs.toString());
  }, [startingCashBs]);
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [closingReport, setClosingReport] = useState<any | null>(null);
  const [closingsHistory, setClosingsHistory] = useState<any[]>([]);
  const [selectedAuditClosing, setSelectedAuditClosing] = useState<any | null>(null);
  const [expandedTickets, setExpandedTickets] = useState<string[]>([]);
  
  const [isClosingDrawer, setIsClosingDrawer] = useState<boolean>(false);
  const [kaluAutoCheckoutTrigger, setKaluAutoCheckoutTrigger] = useState<boolean>(false);

  // New states for Closing History
  const [closingPage, setClosingPage] = useState<number>(1);
  const [closingSearchDate, setClosingSearchDate] = useState<string>('');
  const [selectedClosings, setSelectedClosings] = useState<string[]>([]);
  const [isPurgingClosings, setIsPurgingClosings] = useState<boolean>(false);

  useEffect(() => {
    if (kaluAutoCheckoutTrigger) {
      setKaluAutoCheckoutTrigger(false);
      handleProcessSaleSubmit(undefined, true);
    }
  }, [kaluAutoCheckoutTrigger]);

  useEffect(() => {
    const unsub = onCollectionSnapshot('cashClosings', (data) => {
      // Sort descending by timestamp locally
      data.sort((a: any, b: any) => {
        const tA = new Date(a.timestamp?.seconds ? a.timestamp.seconds * 1000 : a.timestamp).getTime();
        const tB = new Date(b.timestamp?.seconds ? b.timestamp.seconds * 1000 : b.timestamp).getTime();
        return tB - tA;
      });
      setClosingsHistory(data);
    });
    
    return () => unsub();
  }, []);

  // Calculate Cart Totals (Regla estricta 2)
  const { subtotal, tax, total } = React.useMemo(() => {
    const sub = cart.reduce((sum, item) => sum + (parseNum(item.subtotal) || (parseNum(item.quantityKg) * parseNum(item.pricePerKg)) || 0), 0);
    const rate = settings?.taxRate !== undefined ? settings.taxRate : 5;
    const tx = sub * (rate / 100);
    return { subtotal: sub, tax: tx, total: sub + tx };
  }, [cart, settings?.taxRate]);

  const handleAddToCart = (product: CheeseProduct, qty: number = 1.0) => {
    const stock = parseNum(product.stockKg || (product as any).stock || 0);
    if (stock <= 0) {
      onAddNotification(`Stock insuficiente o existencia en cero de ${product.name}`, 'warning');
      return;
    }

    const availableStock = stock;
    const existing = cart.find(item => item.productId === product.id);
    const currentQty = existing ? parseNum(existing.quantityKg) : 0;
    const addQty = parseNum(qty);
    const newQty = parseNum((currentQty + addQty).toFixed(2));
    const pPrice = parseNum(product.sellingPrice || (product as any).price || 0);

    if (newQty > availableStock) {
      onAddNotification(`Stock insuficiente. Solo quedan ${availableStock} ${getUnitLabel(product).toLowerCase()} de ${product.name}.`, 'warning');
      return;
    }

    if (existing) {
      setCart(prev => prev.map(item => 
        item.productId === product.id 
          ? { ...item, quantityKg: newQty, subtotal: parseNum((newQty * pPrice).toFixed(2)) }
          : item
      ));
    } else {
      setCart(prev => [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          quantityKg: addQty,
          pricePerKg: pPrice,
          subtotal: parseNum((addQty * pPrice).toFixed(2)),
          unit: product.unit || getUnitLabel(product) as any
        }
      ]);
    }
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existing = cart.find(item => item.productId === productId);
    if (!existing) return;

    const currentQty = parseNum(existing.quantityKg);
    const deltaNum = parseNum(delta);
    const newQty = parseNum((currentQty + deltaNum).toFixed(2));
    const pPrice = parseNum(existing.pricePerKg);

    if (newQty <= 0) {
      handleRemoveFromCart(productId);
      return;
    }

    const stock = parseNum(product.stockKg);
    if (newQty > stock) {
      onAddNotification(`Stock insuficiente. Máximo ${stock} ${getUnitLabel(product).toLowerCase()} disponibles.`, 'warning');
      return;
    }

    setCart(prev => prev.map(item =>
      item.productId === productId
        ? { ...item, quantityKg: newQty, subtotal: parseNum((newQty * pPrice).toFixed(2)) }
        : item
    ));
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const totalAbonado = addedPayments.reduce((sum, p) => sum + p.amount, 0);

  const handleAddPayment = async () => {
    let rawAmount = parseSafeDecimal(paidAmountInput);
    if (paymentMethod === 'Mundo Kalu') {
       if (addedPayments.some(p => p.method === 'Mundo Kalu')) {
          onAddNotification('Solo puede agregar un abono de Crédito Kalu por venta.', 'warning');
          return;
       }
       if (!paymentReference.trim()) {
          onAddNotification('Ingrese la cédula del cliente para aplicar el Crédito Kalu.', 'warning');
          return;
       }
       
       const currentClient = customerType === 'client' ? clients.find(c => c.id === selectedClientId) : null;
       
       if (!currentClient) {
          onAddNotification('Debe seleccionar un cliente antes de procesar un crédito.', 'warning');
          return;
       }

       const clientCiMatch = 
          (currentClient.cedula && currentClient.cedula === paymentReference) ||
          (currentClient.ci && currentClient.ci === paymentReference) ||
          (currentClient.ciRif && currentClient.ciRif === paymentReference) ||
          (currentClient.idNumber && currentClient.idNumber === paymentReference) ||
          (currentClient.rfc && currentClient.rfc === paymentReference);

       if (!clientCiMatch) {
          onAddNotification('La cédula ingresada no coincide con el cliente seleccionado.', 'warning');
          return;
       }
       
       const foundClient = currentClient;
       
       const initialPct = getClientLevelPct(foundClient?.loyaltyPoints || 0);
       rawAmount = total * initialPct; // Fuerza la inicial para Kalu
    } else if (rawAmount <= 0) {
      onAddNotification('Ingrese un monto válido a abonar.', 'warning');
      return;
    }

    let amountInUsd = rawAmount;
    let currency = '$';

    if (paymentMethod !== 'Efectivo $' && paymentMethod !== 'Mundo Kalu') {
       amountInUsd = rawAmount / exchangeRate;
       currency = 'Bs';
    }

    const newPayment = {
      id: Date.now().toString(),
      method: paymentMethod,
      amount: amountInUsd,
      originalAmount: rawAmount,
      currency,
      reference: paymentReference
    };
    
    setAddedPayments([...addedPayments, newPayment]);
    setPaidAmountInput('');
    setPaymentReference('');
    setPaymentMethod('Efectivo $');

    // ==========================================
    // INTERCEPT: MUNDO KALU LOCK (Aprobación PWA)
    // ==========================================
    if (paymentMethod === 'Mundo Kalu') {
      const client = customerType === 'client' ? clients.find(c => c.id === selectedClientId) : null;
      const initialPct = getClientLevelPct(client?.loyaltyPoints || 0);
      const kaluInitial = parseNum(total * initialPct);
      const kaluDebt = parseNum(total * (1 - initialPct));
      const numCuotas = getKaluInstallmentsCount(kaluCreditType, client?.loyaltyPoints || 0);
      const kaluCuota = parseNum(kaluDebt / numCuotas);
      
      const pendingTx: Partial<Transaction> = {
        category: 'credito',
        isIncome: true,
        amount: total,
        status: 'pending_approval',
        clientId: client?.id,
        clientCi: client?.ciRif || client?.ci || client?.idNumber || client?.cedula || client?.rfc || '',
        
        totalUSD: total,
        downPayment: kaluInitial,
        financedAmount: kaluDebt,
        installmentsCount: numCuotas,
        paymentMethod: 'Mundo Kalu',
        date: new Date().toISOString(),
        invoiceNumber: `KALU-${Date.now().toString().slice(-6)}`,
        timestamp: new Date().toISOString(),
        kaluCreditData: {
          inicial: kaluInitial,
          aFinanciar: kaluDebt,
          cuotas: kaluCuota
        }
      };

      try {
          const now = new Date().toISOString();
          const finalPendingTx = {
            ...pendingTx,
            status: 'pending_approval',
            timestamp: now
          };
          const docRef = await addLocalDoc('transactions', finalPendingTx);
          if (!docRef || !docRef.id) throw new Error("Fallo al guardar transacción");
          
          setIsWaitingForApproval(true);
        setPendingApprovalId(docRef.id);
        
        // Setup listener via WebSocket for real-time approval
        const handleApprovedDoc = async (updatedDoc: any) => {
            if (updatedDoc.status === 'approved') {
                   setIsWaitingForApproval(false);
                   setPendingApprovalId(null);
  
                   // FASE 1: GENERACIÓN DE CUOTAS
                   if (updatedDoc.kaluCreditData && client) {
                     let nextDate = new Date();
                     nextDate.setDate(nextDate.getDate() + 15);
                     
                     const cuotaVal = Number(updatedDoc.kaluCreditData.cuotas || 0);
                     for (let i = 0; i < updatedDoc.installmentsCount; i++) {
                       const installmentDoc = {
                         clientId: client.id,
                         transactionId: updatedDoc.id,
                         amount: cuotaVal,
                         dueDate: nextDate.toISOString().split('T')[0],
                         status: 'pending',
                         installmentNumber: i + 1,
                         totalInstallments: updatedDoc.installmentsCount,
                         pointsEarned: Math.round(cuotaVal),
                         pointsAwarded: false,
                         timestamp: new Date().toISOString()
                       };
                       await addLocalDoc('installments', installmentDoc);
                       nextDate.setDate(nextDate.getDate() + 15);
                     }
                   }
                   
                   // FASE 2: AUTO CHECKOUT
                   setKaluAutoCheckoutTrigger(true);
            }
          };

          // Polling in case WebSocket fails
          const intervalId = setInterval(async () => {
            try {
              const res = await fetch(`https://sistemakalu.com/api/collections/transactions`);
              if (res.ok) {
                const allTxs = await res.json();
                const polledDoc = allTxs.find((t: any) => String(t.id) === String(docRef.id));
                if (polledDoc && polledDoc.status === 'approved') {
                  clearInterval(intervalId);
                  unsubscribe();
                  handleApprovedDoc(polledDoc);
                }
              }
            } catch (e) { /* ignore */ }
          }, 2000);

          const unsubscribe = onCollectionSnapshot('transactions', (data) => {
            const updatedDoc = data.find(d => String(d.id) === String(docRef.id));
            if (updatedDoc && updatedDoc.status === 'approved') {
               clearInterval(intervalId);
               unsubscribe();
               handleApprovedDoc(updatedDoc);
            }
          });
      } catch (err) {
        console.error("Error creating pending approval", err);
        setIsWaitingForApproval(false);
        onAddNotification('Error: No se pudo registrar la orden en el servidor. Verifica la conexión', 'warning');
        setAddedPayments(prev => prev.filter(p => p.id !== newPayment.id));
      }
    }
    // ==========================================
  };

  const handleRemovePayment = (id: string) => {
    setAddedPayments(addedPayments.filter(p => p.id !== id));
  };

  const handleProcessSaleSubmit = async (e?: React.FormEvent, bypassChangeModal = false) => {
    if (e) e.preventDefault();
    if (isProcessing) return;
    setIsProcessing(true);
    
    if (cart.length === 0) {
      onAddNotification('El carrito de compras está vacío.', 'warning');
      setIsProcessing(false);
      return;
    }

    const client = customerType === 'client' ? (clients.find(c => c.id === selectedClientId) || null) : null;
    const supplier = customerType === 'supplier' ? (suppliers.find(s => s.id === selectedSupplierId) || null) : null;

    if (customerType === 'client' && !selectedClientId) {
      onAddNotification('Por favor, seleccione un cliente para registrar la venta.', 'warning');
      setIsProcessing(false);
      return;
    }

    if (customerType === 'supplier' && !selectedSupplierId) {
      onAddNotification('Por favor, seleccione un productor para registrar la venta en su libreta.', 'warning');
      setIsProcessing(false);
      return;
    }

    let mainPaymentMethod = 'Multipago';
    if (addedPayments.length === 1) {
      mainPaymentMethod = addedPayments[0].method;
    } else if (addedPayments.length === 0) {
      mainPaymentMethod = isCreditSale ? 'Crédito / Fiado' : 'Efectivo ($)';
    }

    const isKaluTransaction = mainPaymentMethod === 'Mundo Kalu';
    const isEffectiveCredit = isCreditSale || isKaluTransaction;

    if (!isEffectiveCredit && totalAbonado < total) {
      onAddNotification('El monto total abonado no cubre el valor de la venta.', 'warning');
      setIsProcessing(false);
      return;
    }

    const paidAmount = isEffectiveCredit ? totalAbonado : Math.max(total, totalAbonado);
    const debtAmount = isEffectiveCredit ? Math.max(0, total - totalAbonado) : 0;

    let mainReference = addedPayments.map(p => p.reference).filter(Boolean).join(' | ');

    // Calculate change logic
    const changeAmount = totalAbonado > total ? parseNum((totalAbonado - total).toFixed(2)) : 0;

    if (changeAmount > 0 && !bypassChangeModal) {
      setIsProcessing(false);
      setIsChangeModalOpen(true);
      return;
    }

    const customerName = client ? client.name : supplier ? `${supplier.name} (Productor)` : 'Cliente General';

    // Process sale through parent state
    onProcessSale({
      client,
      supplier,
      items: cart,
      paymentMethod: mainPaymentMethod,
      total,
      paidAmount,
      addedPayments: [...addedPayments],
      changeAmount,
      changeCurrency,
      changeReference,
      changeBs: changeAmount > 0 ? parseNum((changeAmount * exchangeRate).toFixed(2)) : 0,
      bcvRateAtSettlement: exchangeRate,
      mixedChange: changeCurrency === 'MIXED' ? {
        usd: parseNum(mixedChangeUsd),
        bs: parseNum(mixedChangeBs),
        mobile: parseNum(mixedChangeMobile),
        mobileRef: mixedChangeMobileRef
      } : undefined
    });

    const receipt = {
      id: `REC-${Date.now().toString().slice(-6)}`,
      date: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      timestamp: new Date().toISOString(),
      clientName: customerName,
      items: [...cart],
      subtotal,
      tax,
      total,
      paymentMethod: mainPaymentMethod,
      paymentReference: mainReference,
      paidAmount,
      debtAmount,
      addedPayments: [...addedPayments]
    };

    setLastReceipt(receipt);
    setCart([]);
    setSelectedClientId('');
    setSelectedSupplierId('');
    setClientSearchText('');
    setSupplierSearchText('');
    setPaymentMethod('Efectivo ($)');
    setPaymentReference('');
    setPaidAmountInput('');
    setAddedPayments([]);
    setIsCreditSale(false);
    setIsProcessing(false);
    setIsPaymentModalOpen(false);
  };

  // Calculate closing calculations
  // Helper to extract amount from sales  // FILTER VOIDED SALES
  const validSalesHistory = (salesHistory || []).filter(s => !s.isVoided);

  const parseTime = React.useCallback((obj: any) => {
    if (!obj) return 0;
    if (obj.timestamp?.seconds) return obj.timestamp.seconds * 1000;
    if (obj.timestamp) {
      const time = new Date(obj.timestamp).getTime();
      if (!isNaN(time)) return time;
    }
    if (obj.date) {
      const time = new Date(obj.date).getTime();
      if (!isNaN(time)) return time;
    }
    if (obj.createdAt) {
      const time = new Date(obj.createdAt).getTime();
      if (!isNaN(time)) return time;
    }
    return 0;
  }, []);

  React.useEffect(() => {
    // Rutina de Auto-Saneamiento / Migración al Iniciar
    const runMigration = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Inicio del día local
      const startOfTodayMs = today.getTime();
      
      const orphans = allTransactions.filter(t => !t.isClosed && parseTime(t) < startOfTodayMs);
      
      if (orphans.length > 0) {
        console.log(`Migrando ${orphans.length} transacciones huérfanas a cerradas.`);
        await Promise.all(
          orphans.map(t => 
            updateLocalDoc('transactions', t.id, { isClosed: true, closureId: 'CLO-LEGACY-MIGRATED' }).catch(console.error)
          )
        );
      }
    };
    
    if (allTransactions.length > 0) {
      runMigration();
    }
  }, [allTransactions, parseTime]);

  const currentShiftDetails = React.useMemo(() => {
    const currentShiftTransactions = allTransactions.filter(t => !t.isClosed && !t.isVoided);
    const currentShiftSales = validSalesHistory.filter(s => !s.isClosed && !s.isVoided);

    return { currentShiftSales, currentShiftTransactions };
  }, [allTransactions, validSalesHistory]);

  const { currentShiftSales, currentShiftTransactions } = currentShiftDetails;

  const closingDetails = React.useMemo(() => {
    if (!selectedAuditClosing || selectedAuditClosing.purged) return { sales: [], incomes: [], expenses: [] };


    const closingTime = parseTime(selectedAuditClosing);
    
    const previousClosing = closingsHistory
      .filter(c => {
        const t = parseTime(c);
        return t < closingTime;
      })
      .sort((a, b) => {
        const tA = parseTime(a);
        const tB = parseTime(b);
        return tB - tA;
      })[0];
      
    const startTime = previousClosing 
      ? parseTime(previousClosing)
      : 0;
      
    const closingDateObj = closingTime && !isNaN(closingTime) ? new Date(closingTime) : null;
    const closingDateStr = closingDateObj ? `${closingDateObj.getFullYear()}-${String(closingDateObj.getMonth() + 1).padStart(2, '0')}-${String(closingDateObj.getDate()).padStart(2, '0')}` : '';

    const txsInShift = allTransactions.filter(t => {
      if (t.closureId === selectedAuditClosing.id) return true;
      const tTime = parseTime(t);
      if (tTime >= startTime && tTime <= closingTime) return true;
      if (!tTime || isNaN(tTime) || !closingDateStr) return false;
      const tDate = new Date(tTime);
      const tDateStr = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}-${String(tDate.getDate()).padStart(2, '0')}`;
      return tDateStr === closingDateStr && tTime <= closingTime;
    });

    const salesInShift = validSalesHistory.filter(s => {
       if (s.closureId === selectedAuditClosing.id) return true;
       const sTime = parseTime(s);
       if (sTime >= startTime && sTime <= closingTime) return true;
       if (!sTime || isNaN(sTime) || !closingDateStr) return false;
       const sDate = new Date(sTime);
       const sDateStr = `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, '0')}-${String(sDate.getDate()).padStart(2, '0')}`;
       return sDateStr === closingDateStr && sTime <= closingTime;
    });
    
    const incomes = txsInShift.filter(t => (t.category === 'credito' || t.category === 'ingresos_cobranza') && t.isIncome === true);
    const expenses = txsInShift.filter(t => t.category === 'gastos' && t.isIncome === false);

    return { sales: salesInShift, incomes, expenses };
  }, [selectedAuditClosing, closingsHistory, allTransactions, validSalesHistory, parseTime]);

  // ARQUEO CALCULATIONS
  const getSalesTotalByMethod = (method: string) => {
    return currentShiftSales.reduce((sum: number, s: any) => {
      // 1. Si la venta tiene desglose de pagos parciales (Multipago)
      if (s.addedPayments && Array.isArray(s.addedPayments) && s.addedPayments.length > 0) {
        const amountInMethod = s.addedPayments
          .filter((p: any) => {
            if (!p || !p.method) return false;
            const m = p.method.toLowerCase().trim();
            if (method === 'Efectivo $') return m.includes('efectivo') && (m.includes('$') || m.includes('usd') || (!m.includes('bs') && !m.includes('ves')));
            if (method === 'Efectivo Bs') return m.includes('efectivo') && (m.includes('bs') || m.includes('ves'));
            if (method === 'Pago Móvil') return m.includes('movil') || m.includes('transfer') || m === 'pago movil' || m === 'pago móvil';
            if (method === 'Tarjeta / Punto') return m.includes('tarjeta') || m.includes('punto') || m.includes('pos') || m.includes('debito');
            if (method === 'BioPago') return m.includes('bio');
            return m === method.toLowerCase().trim();
          })
          .reduce((acc: number, p: any) => {
            // Si el método es en Bs, usamos originalAmount (que está en Bs). Si no existe (legacy), lo calculamos con la tasa
            if (method === 'Efectivo Bs' || method === 'Pago Móvil' || method === 'BioPago') {
               const val = Number(p.originalAmount) || (Number(p.amount) * (s.bcvRateAtSettlement || exchangeRate || 1));
               return acc + val;
            }
            const val = Number(p.amount) || Number(p.usdAmount) || 0;
            return acc + val;
          }, 0);
        return sum + amountInMethod;
      }

      // 2. Si la venta es de método simple (NO multipago)
      const pm = (s.paymentMethod || '').toLowerCase().trim();
      if (pm === 'multipago') return sum; // Si es multipago sin addedPayments válidos, no sumar al lote de pago simple

      let isMatch = false;
      if (method === 'Efectivo $') {
        isMatch = pm.includes('efectivo') && (pm.includes('$') || pm.includes('usd') || (!pm.includes('bs') && !pm.includes('ves')));
      } else if (method === 'Efectivo Bs') {
        isMatch = pm.includes('efectivo') && (pm.includes('bs') || pm.includes('ves'));
      } else if (method === 'Pago Móvil') {
        isMatch = pm.includes('movil') || pm.includes('transfer') || pm === 'pago movil' || pm === 'pago móvil';
      } else if (method === 'Tarjeta / Punto') {
        isMatch = pm.includes('tarjeta') || pm.includes('punto') || pm.includes('pos') || pm.includes('debito');
      } else if (method === 'BioPago') {
        isMatch = pm.includes('bio');
      } else {
        isMatch = pm === method.toLowerCase().trim();
      }

      let saleAmount = Number(s.amount) || Number(s.total) || Number(s.paidAmount) || 0;
      
      // Si es un método en Bs y no es multipago (legacy), multiplicamos aquí mismo para devolver el monto en Bs nominal
      if (isMatch && (method === 'Efectivo Bs' || method === 'Pago Móvil' || method === 'Transferencia' || method === 'BioPago' || method === 'Tarjeta / Punto' || method === 'Tarjeta')) {
         saleAmount = saleAmount * (s.bcvRateAtSettlement || exchangeRate || 1);
      }
      
      return sum + (isMatch ? saleAmount : 0);
    }, 0);
  };

  const getTransactionsTotalByMethod = (method: string, category: string, isIncome: boolean) => {
    return currentShiftTransactions
      .filter(t => (t.category === category || (category === 'credito' && t.category === 'ingresos_cobranza')) && t.isIncome === isIncome && !t.isVoided && (t.paymentMethod === method || (method === 'Efectivo $' && t.paymentMethod === 'Efectivo')))
      .reduce((sum, t) => sum + t.amount, 0);
  };

  const getTotalChange = (currency: 'USD' | 'BS' | 'PAGO_MOVIL') => {
    return currentShiftSales.reduce((sum, s) => {
      if (s.changeCurrency === currency) {
        if (currency === 'BS' || currency === 'PAGO_MOVIL') {
           // Si devolvimos el vuelto nominal en Bs en changeBs, úsalo, sino usa la conversión
           return sum + (Number(s.changeBs) || (Number(s.changeAmount) * (s.bcvRateAtSettlement || exchangeRate || 1)));
        }
        return sum + (Number(s.changeAmount) || 0);
      } else if (s.changeCurrency === 'MIXED' && s.mixedChange) {
        if (currency === 'USD') return sum + (Number(s.mixedChange.usd) || 0);
        if (currency === 'BS') return sum + (Number(s.mixedChange.bs) || 0);
        if (currency === 'PAGO_MOVIL') return sum + (Number(s.mixedChange.mobile) || 0);
      }
      return sum;
    }, 0);
  };

  // 1. Efectivo USD ($)
  const salesCashUsd = getSalesTotalByMethod('Efectivo $') - getTotalChange('USD');
  const incomeCashUsd = getTransactionsTotalByMethod('Efectivo $', 'credito', true);
  const totalCashUsd = salesCashUsd + incomeCashUsd;

  // 2. Efectivo Bs
  // Ya getSalesTotalByMethod devuelve en Bs y getTotalChange devuelve en Bs nominal
  const salesCashBs = getSalesTotalByMethod('Efectivo Bs') - getTotalChange('BS');
  const incomeCashBs = getTransactionsTotalByMethod('Efectivo Bs', 'credito', true) * (exchangeRate || 1);
  const totalCashBs = salesCashBs + incomeCashBs;

  // 3. Punto de Venta / Tarjetas
  const salesCard = getSalesTotalByMethod('Tarjeta / Punto') + getSalesTotalByMethod('Tarjeta');
  const incomeCard = (getTransactionsTotalByMethod('Tarjeta / Punto', 'credito', true) + getTransactionsTotalByMethod('Tarjeta', 'credito', true)) * (exchangeRate || 1);
  const totalCard = salesCard + incomeCard;

  // 4. Pago Móvil
  const salesMobile = getSalesTotalByMethod('Pago Móvil') + getSalesTotalByMethod('Transferencia') - getTotalChange('PAGO_MOVIL');
  const incomeMobile = (getTransactionsTotalByMethod('Pago Móvil', 'credito', true) + getTransactionsTotalByMethod('Transferencia', 'credito', true)) * (exchangeRate || 1);
  const totalMobile = salesMobile + incomeMobile;

  // 5. Biopago
  const salesBiopago = getSalesTotalByMethod('BioPago');
  const incomeBiopago = getTransactionsTotalByMethod('BioPago', 'credito', true) * (exchangeRate || 1);
  const totalBiopago = salesBiopago + incomeBiopago;

  // 6. Ventas a Crédito (Fiado) - Calculado desde las ventas del día actual
  const totalCreditSales = currentShiftSales.reduce((sum, s) => sum + (Number(s.debtAmount) || 0), 0);

  // 7. Gastos en Efectivo USD y Bs
  const expensesCashUsd = getTransactionsTotalByMethod('Efectivo $', 'gastos', false) + getTransactionsTotalByMethod('Efectivo', 'gastos', false);
  const expensesCashBs = getTransactionsTotalByMethod('Efectivo Bs', 'gastos', false) * (exchangeRate || 1);

  // Efectivo total calculado en caja (Gaveta USD)
  const expectedUsd = startingCashUsd + salesCashUsd + incomeCashUsd - expensesCashUsd;
  const diffUsd = actualCashUsd - expectedUsd;

  // Efectivo total calculado en caja (Gaveta Bs)
  const expectedBs = startingCashBs + salesCashBs + incomeCashBs - expensesCashBs;
  const diffBs = actualCashBs - expectedBs;

  const handlePerformClosing = async () => {
    if (isClosingDrawer) return;

    if (currentShiftTransactions.length === 0) {
      onAddNotification('Bloqueo: No hay transacciones pendientes para cerrar el turno.', 'warning');
      return;
    }

    setIsClosingDrawer(true);
    try {
      const now = new Date();
      // YYYYMMDDHHmmss based on local time, safer than toISOString
      const localTimestampStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const deterministicId = `CLO-${localTimestampStr}`;
      
      const report = {
        id: deterministicId,
        date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
        timestamp: new Date().toISOString(),
        startingCashUsd,
        startingCashBs,
        salesCashUsd,
        incomeCashUsd,
        totalCashUsd,
        salesCashBs,
        incomeCashBs,
        totalCashBs,
        totalCard,
        totalMobile,
        totalBiopago,
        totalCreditSales,
        expensesCashUsd,
        expensesCashBs,
        expectedUsd,
        expectedBs,
        actualCashUsd,
        actualCashBs,
        diffUsd,
        diffBs,
        initialCashUsd: startingCashUsd,
        initialCashBs: startingCashBs,
        countedCashUsd: actualCashUsd,
        countedCashBs: actualCashBs,
        expectedCashUsd: expectedUsd,
        expectedCashBs: expectedBs,
        differenceUsd: diffUsd,
        differenceBs: diffBs,
        status: (diffUsd === 0 && diffBs === 0) ? 'Balance Perfecto' : (diffUsd > 0 || diffBs > 0) ? 'Sobrante' : 'Faltante',
        bcvRateAtClose: exchangeRate || 1,
        };
      
      await addLocalDoc('cashClosings', report);

      // CIERRE FUERTE: Marcar todas las transacciones del turno
      await Promise.all(
        currentShiftTransactions.map(tx => 
          updateLocalDoc('transactions', tx.id, { isClosed: true, closureId: deterministicId })
        )
      );

      // Actualizar Bóveda Central (única fuente de verdad) en Firebase
      const currentVault = settings?.centralVaultBalance || { usd: 0, bs: 0, bankBs: 0, bankUsd: 0 };
      const updatedVault = {
        usd: currentVault.usd + expectedUsd,
        bs: currentVault.bs + expectedBs,
        bankBs: currentVault.bankBs + totalMobile + totalBiopago + totalCard,
        bankUsd: currentVault.bankUsd
      };

      if (onUpdateSettings) {
        onUpdateSettings({ centralVaultBalance: updatedVault });
      }
      if (settings) {
        await updateLocalDoc('settings', 'general', {
          centralVaultBalance: updatedVault
        });
      }

      setIsClosed(true);
      setClosingReport(report);
      
      // Resetear estado del turno a cero
      setActualCashUsd(0);
      setActualCashBs(0);
      setStartingCashUsd(0);
      setStartingCashBs(0);

      onAddNotification('Cierre de caja registrado y Tesorería actualizada.', 'success');
    } catch (error) {
      console.error('Error al guardar cierre de caja:', error);
      onAddNotification('Error al guardar el cierre en la nube. Reintente.', 'warning');
    } finally {
      setIsClosingDrawer(false);
    }
  };

  const handlePurgeSelectedClosings = async () => {
    if (selectedClosings.length === 0) return;
    const confirm = window.confirm(`¿Estás seguro de que deseas purgar (compactar) ${selectedClosings.length} cierres? Esto eliminará el detalle de ventas de esos turnos para ahorrar espacio, pero conservará los montos del arqueo.`);
    if (!confirm) return;

    setIsPurgingClosings(true);
    try {
      for (const closingId of selectedClosings) {
        const closing = closingsHistory.find(c => c.id === closingId);
        if (!closing || closing.purged) continue;

        // Find T_fin and T_inicio
        const closingTime = new Date(closing.timestamp?.seconds ? closing.timestamp.seconds * 1000 : closing.timestamp).getTime();
        
        // Find the immediately preceding closing
        const previousClosing = closingsHistory
          .filter(c => {
            const t = new Date(c.timestamp?.seconds ? c.timestamp.seconds * 1000 : c.timestamp).getTime();
            return t < closingTime;
          })
          .sort((a, b) => {
            const tA = new Date(a.timestamp?.seconds ? a.timestamp.seconds * 1000 : a.timestamp).getTime();
            const tB = new Date(b.timestamp?.seconds ? b.timestamp.seconds * 1000 : b.timestamp).getTime();
            return tB - tA;
          })[0];
          
        const startTime = previousClosing 
          ? new Date(previousClosing.timestamp?.seconds ? previousClosing.timestamp.seconds * 1000 : previousClosing.timestamp).getTime()
          : 0;

        // Find transactions to delete
        const txsToDelete = allTransactions.filter(t => {
          if (t.closureId === closing.id) return true;
          
          // Fallback para cierres viejos
          const tTime = new Date(t.timestamp?.seconds ? t.timestamp.seconds * 1000 : t.timestamp).getTime();
          return tTime > startTime && tTime <= closingTime;
        });

        if (txsToDelete.length > 0) {
          const ids = txsToDelete.map(t => t.id);
          await batchDeleteLocalDocs('transactions', ids);
        }

        // Mark the closing as purged
        await updateLocalDoc('cashClosings', closing.id, { purged: true });
      }

      setSelectedClosings([]);
      onAddNotification('Cierres seleccionados purgados correctamente.', 'success');
    } catch (e) {
      console.error(e);
      onAddNotification('Error al purgar cierres.', 'warning');
    } finally {
      setIsPurgingClosings(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Tab Navigation */}
      <div className="flex border-b border-editorial-border gap-6">
        <button
          onClick={() => setActiveTab('pos')}
          className={`pb-3 font-serif text-lg font-bold tracking-tight transition-all border-b-2 relative -bottom-[2px] cursor-pointer ${
            activeTab === 'pos' ? 'border-amber-500 text-editorial-text-primary' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          Punto de Venta
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 font-serif text-lg font-bold tracking-tight transition-all border-b-2 relative -bottom-[2px] cursor-pointer ${
            activeTab === 'history' ? 'border-amber-500 text-editorial-text-primary' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          Historial de Ventas
        </button>
        <button
          onClick={() => setActiveTab('closing')}
          className={`pb-3 font-serif text-lg font-bold tracking-tight transition-all border-b-2 relative -bottom-[2px] cursor-pointer ${
            activeTab === 'closing' ? 'border-amber-500 text-editorial-text-primary' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          Cierre de Caja Diario
        </button>
        <button
          onClick={() => setActiveTab('closing_history')}
          className={`pb-3 font-serif text-lg font-bold tracking-tight transition-all border-b-2 relative -bottom-[2px] cursor-pointer ${
            activeTab === 'closing_history' ? 'border-amber-500 text-editorial-text-primary' : 'border-transparent text-editorial-text-muted hover:text-editorial-text-primary'
          }`}
        >
          Historial de Cierres
        </button>

        <div className="ml-auto">
          {(() => {
            const pendingOrders = mobileOrders.filter(o => o.status === 'Pendiente');
            const hasPending = pendingOrders.length > 0;
            return (
              <button
                onClick={() => setIsPedidosModalOpen(true)}
                className={`flex items-center gap-2 px-4 py-2 font-mono text-xs font-bold uppercase rounded transition-colors ${
                  hasPending 
                    ? 'bg-rose-500/10 text-rose-500 border border-rose-500/30 animate-pulse'
                    : 'bg-editorial-bg text-editorial-text-muted border border-editorial-border hover:text-editorial-text-primary'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Pedidos</span>
                {hasPending && <span>({pendingOrders.length})</span>}
              </button>
            );
          })()}
        </div>
      </div>

      {activeTab === 'pos' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          {/* Left Column: Product Grid */}
          <div className="xl:col-span-7 flex flex-col h-full min-h-[500px]">
            {/* Search Input */}
            <div className="relative mb-6">
              <input
                ref={searchInputRef}
                type="text"
                autoFocus
                placeholder="Buscar producto..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedProductId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim().length > 3) {
                    const query = searchQuery.trim();
                    const matches = products.filter(p => 
                      (p.name || '').toLowerCase().includes(query.toLowerCase()) || 
                      (p.category || '').toLowerCase().includes(query.toLowerCase()) ||
                      (p.id || '').toLowerCase().includes(query.toLowerCase()) ||
                      (p.barcode || '').toLowerCase() === query.toLowerCase() ||
                      (p.barcodes || []).some(b => b.toLowerCase() === query.toLowerCase())
                    );
                    
                    if (matches.length === 0) {
                      // It's likely an unknown barcode scan
                      setUnknownBarcode(query);
                    } else if (matches.length === 1 && matches[0].stockKg > 0) {
                      setSelectedProductId(matches[0].id);
                      setQtyInput('0');
                    }
                  }
                }}
                className="w-full h-12 pl-4 pr-4 bg-editorial-bg border border-editorial-border rounded text-sm text-editorial-text-primary focus:outline-none focus:border-amber-500 font-sans"
              />
            </div>

            {/* Product Cards (Only show if search is not empty) */}
            {searchQuery && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {products
                  .filter(p => {
                    try {
                      return (p.name || '').toLowerCase().includes((searchQuery || '').toLowerCase()) || 
                             (p.category || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
                             (p.id || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
                             (p.barcode || '').toLowerCase() === (searchQuery || '').toLowerCase() ||
                             (p.barcodes || []).some(b => b.toLowerCase() === (searchQuery || '').toLowerCase());
                    } catch (e) {
                      console.error('Error filtrando producto:', p, e);
                      return false;
                    }
                  })
                  .map((p) => {
                    const safeStock = Number(p.stockKg || (p as any).stock || 0);
                    const isSoldOut = safeStock <= 0;
                    const isLowStock = safeStock > 0 && safeStock <= p.alertThreshold;
                    const isSelected = selectedProductId === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          if (!isSoldOut && !isSelected) {
                            setSelectedProductId(p.id);
                            setQtyInput('0');
                          }
                        }}
                        className={`bg-editorial-card border border-editorial-border rounded p-5 flex flex-col transition-all duration-300 relative group overflow-hidden ${
                          isSoldOut ? 'opacity-60 border-rose-500/20' : 'hover:border-amber-500/40 cursor-pointer'
                        } ${isSelected ? 'ring-2 ring-amber-500' : 'min-h-[160px]'}`}
                      >
                        {p.imageUrl && (
                          <>
                            <div className="absolute inset-0 z-0">
                              <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                            </div>
                            <div className="absolute inset-0 z-0 bg-gradient-to-t from-black/90 via-black/50 to-black/30 transition-colors duration-300"></div>
                          </>
                        )}
                        <div className={`space-y-1 relative z-10 flex-1 flex flex-col justify-end`}>
                          <div className="flex justify-between items-start mb-auto">
                            {isSoldOut ? (
                              <span className="text-[8px] font-mono font-extrabold bg-rose-950/80 text-rose-400 border border-rose-800/40 px-2 py-0.5 rounded uppercase backdrop-blur-sm shadow-md">
                                Agotado
                              </span>
                            ) : isLowStock ? (
                              <span className="text-[8px] font-mono font-extrabold bg-amber-950/80 text-amber-400 border border-amber-800/40 px-2 py-0.5 rounded uppercase animate-pulse backdrop-blur-sm shadow-md">
                                Bajo Stock
                              </span>
                            ) : <div/>}
                            <span className={`text-[9px] font-mono tracking-widest uppercase ml-auto ${p.imageUrl ? 'text-white/80 drop-shadow-md' : 'text-editorial-text-muted'}`}>
                              {p.category} • {(p.origin || '').split(' ')[0]}
                            </span>
                          </div>
                          <h3 className={`font-serif text-lg font-bold leading-tight pt-3 ${p.imageUrl ? 'text-white drop-shadow-lg' : 'text-editorial-text-primary'}`}>
                            {p.name}
                          </h3>
                          <p className={`font-mono text-xs font-bold pt-1 ${p.imageUrl ? 'text-amber-400 drop-shadow-md' : 'text-amber-500'}`}>
                            ${Number(p.sellingPrice || (p as any).price || 0).toFixed(2)} <span className={`text-[10px] font-normal font-sans ${p.imageUrl ? 'text-white/60' : 'text-editorial-text-muted'}`}>/ {getUnitLabel(p).toLowerCase()}</span>
                          </p>
                        </div>

                        {isSelected ? (
                          <div className="mt-4 pt-3 border-t border-editorial-border/60 space-y-3 relative z-10">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                autoFocus
                                value={qtyInput}
                                onChange={(e) => setQtyInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const qty = parseFloat(qtyInput);
                                    if (qty > 0) {
                                      handleAddToCart(p, qty);
                                      setSelectedProductId(null);
                                      setSearchQuery('');
                                      searchInputRef.current?.focus();
                                    }
                                  }
                                }}
                                className="w-full h-10 px-3 bg-editorial-bg/90 border border-editorial-border rounded text-sm text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500 backdrop-blur-md"
                                placeholder="Cant."
                              />
                              <span className={`text-xs ${p.imageUrl ? 'text-white/80' : 'text-editorial-text-muted'}`}>{getUnitLabel(p)}</span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const qty = parseNum(qtyInput);
                                  if (qty > 0) {
                                    handleAddToCart(p, qty);
                                    setSelectedProductId(null);
                                    setSearchQuery('');
                                    searchInputRef.current?.focus();
                                  }
                                }}
                                className="flex-1 py-1.5 bg-amber-500 text-white text-xs font-bold rounded cursor-pointer shadow-lg"
                              >
                                Sí
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProductId(null);
                                }}
                                className="flex-1 py-1.5 border border-editorial-border/50 bg-black/40 text-white/90 text-xs font-bold rounded hover:bg-black/60 cursor-pointer backdrop-blur-md"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 pt-3 border-t border-editorial-border/60 flex items-center justify-between relative z-10">
                            <span className={`font-mono text-[10px] ${p.imageUrl ? 'text-white/70' : 'text-editorial-text-muted'}`}>
                              Stock: <span className={`font-sans font-bold ${p.imageUrl ? 'text-white' : 'text-editorial-text-primary'}`}>{p.stockKg.toFixed(1)} {getUnitLabel(p)}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Cart Items at the Bottom of Left Column */}
            {cart.length > 0 && (
              <div className="mt-4 border-t border-editorial-border/60 pt-4 space-y-1">
                {cart.map((item, idx) => (
                  <div key={item.productId} className="flex justify-between items-center text-xs text-editorial-text-primary py-1 border-b border-editorial-border/30 last:border-0 hover:bg-editorial-bg/30 px-2 rounded">
                    <span className="font-mono text-[10px] text-editorial-text-muted mr-3">Línea {idx + 1}</span>
                    <span className="flex-1 truncate font-semibold">{item.name}</span>
                    <div className="flex items-center gap-4 ml-4">
                      <span className="font-mono text-editorial-text-muted">{item.quantityKg} {getUnitLabel(item)} x ${item.pricePerKg.toFixed(2)}</span>
                      <span className="font-mono font-bold text-amber-500">${item.subtotal.toFixed(2)}</span>
                      <button
                        onClick={() => handleRemoveFromCart(item.productId)}
                        className="text-rose-400 hover:text-rose-500 transition-colors ml-2 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Register Checkout Terminal */}
          <div className="xl:col-span-5 space-y-6">
            <div className="bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
              <h3 className="font-serif text-xl font-bold text-editorial-text-primary tracking-tight">
                Caja Registradora
              </h3>

              <div className="space-y-4">
                {/* Tipo de Destinatario Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                    Tipo de Destinatario
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { type: 'client', label: 'Cliente' },
                      { type: 'supplier', label: 'Libreta Quesero' }
                    ].map(t => (
                      <button
                        key={t.type}
                        type="button"
                        onClick={() => {
                          setCustomerType(t.type as any);
                          setSelectedClientId('');
                          setSelectedSupplierId('');
                          setClientSearchText('');
                          setSupplierSearchText('');
                        }}
                        className={`py-1.5 text-[10px] font-mono font-bold uppercase rounded border transition-all cursor-pointer ${
                          customerType === t.type
                            ? 'bg-amber-500 border-amber-600 text-white'
                            : 'bg-editorial-bg border-editorial-border text-editorial-text-muted hover:text-editorial-text-primary'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conditional customer selects with Autocomplete */}
                {customerType === 'client' && (
                  <div className="space-y-1.5 relative">
                    <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                      Buscar Cliente de Tienda
                    </label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-editorial-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Escriba para buscar un cliente..."
                        value={clientSearchText}
                        onChange={(e) => {
                          setClientSearchText(e.target.value);
                          setIsClientDropdownOpen(true);
                          if (selectedClientId) setSelectedClientId('');
                        }}
                        onFocus={() => setIsClientDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setIsClientDropdownOpen(false), 200)}
                        className="w-full h-10 pl-9 pr-4 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500 font-sans"
                      />
                      {isClientDropdownOpen && clientSearchText && (
                        <div className="absolute z-10 w-full mt-1 bg-editorial-card border border-editorial-border rounded shadow-lg max-h-48 overflow-y-auto">
                          {clients.filter(c => {
                              try {
                                return (c.name || '').toLowerCase().includes((clientSearchText || '').toLowerCase()) || 
                                       (c.rfc || '').toLowerCase().includes((clientSearchText || '').toLowerCase()) ||
                                       (c.phone || '').toLowerCase().includes((clientSearchText || '').toLowerCase()) ||
                                       (c.id || '').toLowerCase().includes((clientSearchText || '').toLowerCase());
                              } catch (e) {
                                console.error('Error filtrando cliente:', c, e);
                                return false;
                              }
                            }
                          ).length > 0 ? (
                            clients.filter(c => {
                                try {
                                  return (c.name || '').toLowerCase().includes((clientSearchText || '').toLowerCase()) || 
                                         (c.rfc || '').toLowerCase().includes((clientSearchText || '').toLowerCase()) ||
                                         (c.phone || '').toLowerCase().includes((clientSearchText || '').toLowerCase()) ||
                                         (c.id || '').toLowerCase().includes((clientSearchText || '').toLowerCase());
                                } catch (e) {
                                  return false;
                                }
                              }
                            ).map(c => (
                              <div
                                key={c.id}
                                onMouseDown={() => {
                                  setSelectedClientId(c.id);
                                  setClientSearchText(c.name || '');
                                  setIsClientDropdownOpen(false);
                                }}
                                className="px-4 py-2 hover:bg-amber-500 hover:text-white cursor-pointer text-xs transition-colors border-b border-editorial-border/30 last:border-0"
                              >
                                {c.name} 
                                { (c.outstandingDebt || 0) > 0 && (
                                  <span className="opacity-75 text-[10px] ml-2">- {c.rfc || 'S/N'} (Adeudo: ${(c.outstandingDebt || 0).toFixed(0)} USD)</span>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="px-4 py-2 text-xs text-editorial-text-muted text-center">No se encontraron coincidencias</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {customerType === 'supplier' && (
                  <div className="space-y-1.5 relative">
                    <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                      Buscar Productor / Proveedor
                    </label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-editorial-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Escriba para buscar un productor..."
                        value={supplierSearchText}
                        onChange={(e) => {
                          setSupplierSearchText(e.target.value);
                          setIsSupplierDropdownOpen(true);
                          if (selectedSupplierId) setSelectedSupplierId('');
                        }}
                        onFocus={() => setIsSupplierDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setIsSupplierDropdownOpen(false), 200)}
                        className="w-full h-10 pl-9 pr-4 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary focus:outline-none focus:border-amber-500 font-sans"
                      />
                      {isSupplierDropdownOpen && supplierSearchText && (
                        <div className="absolute z-10 w-full mt-1 bg-editorial-card border border-editorial-border rounded shadow-lg max-h-48 overflow-y-auto">
                          {suppliers.filter(s => {
                              try {
                                if (!s.isCheeseProducer && !s.isEmployee) return false;
                                return (s.name || '').toLowerCase().includes((supplierSearchText || '').toLowerCase()) || 
                                       (s.rfc || s.idNumber || '').toLowerCase().includes((supplierSearchText || '').toLowerCase()) ||
                                       (s.phone || '').toLowerCase().includes((supplierSearchText || '').toLowerCase()) ||
                                       (s.id || '').toLowerCase().includes((supplierSearchText || '').toLowerCase());
                              } catch (e) {
                                console.error('Error filtrando proveedor:', s, e);
                                return false;
                              }
                            }
                          ).length > 0 ? (
                            suppliers.filter(s => {
                                try {
                                  if (!s.isCheeseProducer && !s.isEmployee) return false;
                                  return (s.name || '').toLowerCase().includes((supplierSearchText || '').toLowerCase()) || 
                                         (s.rfc || s.idNumber || '').toLowerCase().includes((supplierSearchText || '').toLowerCase()) ||
                                         (s.phone || '').toLowerCase().includes((supplierSearchText || '').toLowerCase()) ||
                                         (s.id || '').toLowerCase().includes((supplierSearchText || '').toLowerCase());
                                } catch (e) {
                                  return false;
                                }
                              }
                            ).map(s => (
                              <div
                                key={s.id}
                                onMouseDown={() => {
                                  setSelectedSupplierId(s.id);
                                  setSupplierSearchText(s.name || '');
                                  setIsSupplierDropdownOpen(false);
                                }}
                                className="px-4 py-2 hover:bg-amber-500 hover:text-white cursor-pointer text-xs transition-colors border-b border-editorial-border/30 last:border-0"
                              >
                                {s.name} 
                                { (s.balanceOwed || 0) > 0 && (
                                  <span className="opacity-75 text-[10px] ml-2">- {s.rfc || s.idNumber || 'S/N'} (Deuda: ${(s.balanceOwed || 0).toFixed(0)})</span>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="px-4 py-2 text-xs text-editorial-text-muted text-center">No se encontraron coincidencias</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="h-px bg-editorial-border/60 my-4" />

                {/* Calculations summary */}
                <div key={Date.now() + Math.random()} className="space-y-1.5 font-mono text-[11px] text-editorial-text-muted">
                  <div className="flex justify-between">
                    <span>Total parcial:</span>
                    <span className="text-editorial-text-primary">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>IVA ({settings?.taxRate ?? 5}%):</span>
                    <span className="text-editorial-text-primary">${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-serif text-lg font-bold text-editorial-text-primary pt-1.5 border-t border-editorial-border/40">
                    <span className="font-sans text-xs text-editorial-text-muted uppercase font-normal tracking-wider">TOTAL A COBRAR:</span>
                    <span className="text-amber-500">${total.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (customerType === 'client' && !selectedClientId) {
                      onAddNotification('Debe seleccionar un cliente antes de pasar al cobro.', 'warning');
                      return;
                    }
                    if (customerType === 'supplier' && !selectedSupplierId) {
                      onAddNotification('Debe seleccionar un productor antes de pasar al cobro.', 'warning');
                      return;
                    }
                    setIsPaymentModalOpen(true);
                  }}
                  disabled={cart.length === 0 || (customerType === 'client' && !selectedClientId) || (customerType === 'supplier' && !selectedSupplierId)}
                  className="w-full h-12 bg-amber-500 text-white font-serif font-bold text-md tracking-tight flex items-center justify-center gap-2 hover:brightness-110 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Pasar a modo cobro (F4)</span>
                </button>
              </div>
            </div>

            {/* Payment Modal Overlay */}
            {isPaymentModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-editorial-card border border-editorial-border rounded p-6 w-full max-w-5xl shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                  <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="absolute top-4 right-4 text-editorial-text-muted hover:text-amber-500 transition-colors cursor-pointer">
                    <span className="text-3xl leading-none">&times;</span>
                  </button>
                  
                  <div className="mb-6 border-b border-editorial-border/60 pb-4">
                    <h3 className="font-serif text-xl font-bold text-amber-500 tracking-tight uppercase">
                      PROCESAR COBRO (MULTIPAGO)
                    </h3>
                    <p className="text-xs text-editorial-text-muted mt-1 font-mono">Registra los abonos mixtos y finaliza la venta</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                     {/* Left Panel: Breakdowns & Summary */}
                     <div className="md:col-span-5 flex flex-col gap-4">
                       <div className="bg-editorial-bg border border-editorial-border rounded p-4 space-y-3">
                          <div className="flex justify-between items-center text-sm">
                            <span className="font-mono uppercase tracking-widest text-editorial-text-muted">TOTAL VENTA</span>
                            <div className="text-right">
                              <div className="font-mono text-xl font-bold text-editorial-text-primary">${total.toFixed(2)}</div>
                              <div className="font-mono text-[10px] text-editorial-text-muted">Bs {(total * exchangeRate).toFixed(2)}</div>
                            </div>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="font-mono uppercase tracking-widest text-editorial-text-muted">ABONADO</span>
                            <div className="text-right">
                              <div className="font-mono text-lg font-bold text-emerald-400">${totalAbonado.toFixed(2)}</div>
                              <div className="font-mono text-[10px] text-emerald-400/70">Bs {(totalAbonado * exchangeRate).toFixed(2)}</div>
                            </div>
                          </div>
                          
                          <div className="h-px bg-editorial-border/60 my-2" />
                          
                          {totalAbonado > total ? (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded animate-in fade-in duration-300">
                              <div className="flex justify-between items-center text-sm mb-1">
                                <span className="font-mono uppercase tracking-widest text-amber-500 font-bold">VUELTO / CAMBIO</span>
                                <div className="text-right">
                                  <div className="font-mono text-2xl font-bold text-amber-500">${(totalAbonado - total).toFixed(2)}</div>
                                  <div className="font-mono text-[10px] text-amber-500/70">Bs {((totalAbonado - total) * exchangeRate).toFixed(2)}</div>
                                </div>
                              </div>
                            </div>
                          ) : totalAbonado === total ? (
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded animate-in fade-in duration-300">
                              <div className="flex justify-between items-center text-sm mb-1">
                                <span className="font-mono uppercase tracking-widest text-emerald-500 font-bold">COBRADO</span>
                                <div className="text-right">
                                  <div className="font-mono text-2xl font-bold text-emerald-500">$0.00</div>
                                </div>
                              </div>
                            </div>
                          ) : isCreditSale || (addedPayments.length > 0 && addedPayments[0].method === 'Mundo Kalu') ? (
                            <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded animate-in fade-in duration-300">
                              <div className="flex justify-between items-center text-sm mb-1">
                                <span className="font-mono uppercase tracking-widest text-cyan-400 font-bold">SALDO A CRÉDITO / FINANCIADO</span>
                                <div className="text-right">
                                  <div className="font-mono text-2xl font-bold text-cyan-400">${(total - totalAbonado).toFixed(2)}</div>
                                  <div className="font-mono text-[10px] text-cyan-400/70">Bs {((total - totalAbonado) * exchangeRate).toFixed(2)}</div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between items-center text-sm group cursor-pointer" onClick={() => {
                              const rem = total - totalAbonado;
                              setPaidAmountInput(paymentMethod === 'Efectivo $' ? rem.toFixed(2) : (rem * exchangeRate).toFixed(2));
                            }}>
                              <span className="font-mono uppercase tracking-widest text-rose-400 group-hover:text-rose-300 transition-colors">RESTANTE</span>
                              <div className="text-right">
                                <div className="font-mono text-2xl font-bold text-rose-400 group-hover:text-rose-300 transition-colors">${(total - totalAbonado).toFixed(2)}</div>
                                <div className="font-mono text-[10px] text-rose-400/70 group-hover:text-rose-300/70 transition-colors">Bs {((total - totalAbonado) * exchangeRate).toFixed(2)}</div>
                              </div>
                            </div>
                          )}
                       </div>

                       {/* List of Added Payments */}
                       <div className="flex-1 bg-editorial-bg border border-editorial-border rounded p-4 flex flex-col">
                         <span className="font-mono text-[10px] uppercase tracking-widest text-editorial-text-muted mb-3 block">Abonos Registrados</span>
                         <div className="flex-1 overflow-y-auto space-y-2 max-h-40 pr-2">
                           {addedPayments.length === 0 ? (
                             <div className="text-[10px] text-editorial-text-muted text-center py-4 font-mono">Aún no se han añadido pagos.</div>
                           ) : (
                             addedPayments.map(p => (
                               <div key={p.id} className="flex justify-between items-center bg-editorial-card border border-editorial-border p-2 rounded text-xs animate-in fade-in slide-in-from-left-2 duration-200">
                                 <div className="flex flex-col">
                                   <span className="font-bold text-editorial-text-primary uppercase text-[10px]">{p.method}</span>
                                   {p.reference && <span className="text-[9px] text-editorial-text-muted font-mono tracking-wider">REF: {p.reference}</span>}
                                 </div>
                                 <div className="flex items-center gap-3">
                                   <div className="text-right">
                                     <div className="font-mono font-bold text-amber-500">{p.currency} {(p.originalAmount || p.amount).toFixed(2)}</div>
                                     {p.currency !== '$' && <div className="font-mono text-[9px] text-editorial-text-muted">~${p.amount.toFixed(2)}</div>}
                                   </div>
                                   <button type="button" onClick={() => handleRemovePayment(p.id)} className="text-rose-400 hover:text-rose-500 cursor-pointer text-xs leading-none" title="Eliminar pago">&times;</button>
                                 </div>
                               </div>
                             ))
                           )}
                         </div>
                       </div>
                     </div>

                     {/* Right Panel: Add Payment Interface */}
                     <div className="md:col-span-7 flex flex-col gap-4">
                       <div className="bg-editorial-bg border border-editorial-border rounded p-4">
                          <label className="font-mono text-[10px] uppercase tracking-widest text-editorial-text-muted block mb-3">Agregar Nuevo Abono</label>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                            {[
                              { id: 'Efectivo $', label: '$ USD', icon: Banknote, color: 'text-emerald-400', border: 'border-emerald-400/50', activeBg: 'bg-emerald-400/20', hover: 'hover:border-emerald-400' },
                              { id: 'Efectivo Bs', label: 'Bs Efectivo', icon: Coins, color: 'text-lime-400', border: 'border-lime-400/50', activeBg: 'bg-lime-400/20', hover: 'hover:border-lime-400' },
                              { id: 'Pago Móvil', label: 'Pago Móvil', icon: Smartphone, color: 'text-violet-400', border: 'border-violet-400/50', activeBg: 'bg-violet-400/20', hover: 'hover:border-violet-400' },
                              { id: 'Tarjeta / Punto', label: 'Tarjeta', icon: CreditCard, color: 'text-cyan-400', border: 'border-cyan-400/50', activeBg: 'bg-cyan-400/20', hover: 'hover:border-cyan-400' },
                              { id: 'BioPago', label: 'Biopago', icon: Fingerprint, color: 'text-fuchsia-400', border: 'border-fuchsia-400/50', activeBg: 'bg-fuchsia-400/20', hover: 'hover:border-fuchsia-400' },
                              { id: 'Mundo Kalu', label: 'Crédito Kalu', icon: Store, color: 'text-amber-500', border: 'border-amber-500/50', activeBg: 'bg-amber-500/20', hover: 'hover:border-amber-500' }
                            ].map(m => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setPaymentMethod(m.id);
                                  if (m.id === 'Mundo Kalu' && customerType === 'client') {
                                    const client = clients.find(c => c.id === selectedClientId);
                                    if (client) {
                                      setPaymentReference(client.ciRif || client.ci || client.cedula || client.idNumber || client.rfc || '');
                                    } else {
                                      setPaymentReference('');
                                    }
                                  } else {
                                    setPaymentReference('');
                                  }
                                  setPaidAmountInput('');
                                }}
                                className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                                  paymentMethod === m.id
                                    ? `${m.border} ${m.activeBg} shadow-lg scale-105`
                                    : `border-editorial-border bg-editorial-card ${m.hover} opacity-70 hover:opacity-100`
                                }`}
                              >
                                <m.icon className={`w-6 h-6 ${m.color}`} />
                                <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${paymentMethod === m.id ? m.color : 'text-editorial-text-primary'}`}>
                                  {m.label}
                                </span>
                              </button>
                            ))}
                          </div>

                          {/* Toggle Kalu Credit Type */}
                          {paymentMethod === 'Mundo Kalu' && (
                             <div className="grid grid-cols-2 gap-3 mb-4 animate-in fade-in">
                                <button
                                   type="button"
                                   onClick={() => setKaluCreditType('cotidiano')}
                                   className={`h-9 rounded border flex items-center justify-center text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
                                      kaluCreditType === 'cotidiano'
                                         ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-inner'
                                         : 'bg-editorial-card text-editorial-text-muted border-editorial-border hover:border-amber-500/30'
                                   }`}
                                >
                                   Cotidiano
                                </button>
                                <button
                                   type="button"
                                   onClick={() => setKaluCreditType('repuestos')}
                                   className={`h-9 rounded border flex items-center justify-center text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ${
                                      kaluCreditType === 'repuestos'
                                         ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-inner'
                                         : 'bg-editorial-card text-editorial-text-muted border-editorial-border hover:border-amber-500/30'
                                   }`}
                                >
                                   Repuestos / Gen
                                </button>
                             </div>
                          )}

                          <div className={`grid ${paymentMethod === 'Mundo Kalu' ? 'grid-cols-1' : 'grid-cols-2'} gap-4 mb-4`}>
                            {paymentMethod !== 'Mundo Kalu' && (
                                <div className="space-y-2">
                                  <label className="font-mono text-[10px] uppercase tracking-widest text-editorial-text-muted block">
                                    BILLETE / MONTO RECIBIDO FÍSICAMENTE ({paymentMethod === 'Efectivo $' ? '$' : 'Bs'})
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={paidAmountInput}
                                    onChange={(e) => setPaidAmountInput(e.target.value)}
                                    placeholder={`Ej: ${paymentMethod === 'Efectivo $' ? Math.max(0, total - totalAbonado).toFixed(2) : (Math.max(0, total - totalAbonado) * exchangeRate).toFixed(2)}`}
                                    className="w-full h-10 px-3 bg-editorial-card border border-amber-500/50 rounded text-lg text-amber-500 font-mono font-bold focus:outline-none focus:border-amber-500"
                                  />
                                </div>
                            )}
                            
                            {/* Reference Inputs (Excluyendo Mundo Kalu aquí) */}
                            {(paymentMethod === 'Pago Móvil' || paymentMethod === 'BioPago' || paymentMethod === 'Tarjeta / Punto') && (
                              <div className="space-y-2 animate-in fade-in duration-200">
                                <label className="font-mono text-[10px] uppercase tracking-widest text-amber-500 block">
                                  {paymentMethod === 'Tarjeta / Punto' ? 'APROBACIÓN PUNTO' : 'REFERENCIA'}
                                </label>
                                <input
                                  type="text"
                                  value={paymentReference}
                                  onChange={(e) => setPaymentReference(e.target.value)}
                                  placeholder={"N° Ref..."}
                                  className="w-full h-10 px-3 bg-editorial-card border border-editorial-border rounded text-sm text-editorial-text-primary focus:outline-none focus:border-amber-500 font-mono"
                                />
                              </div>
                            )}
                          </div>
                          
                          {/* Mundo Kalu Breakdown */}
                          {paymentMethod === 'Mundo Kalu' && (
                            (() => {
                              const foundClient = clients.find(c => 
                                (c.cedula && c.cedula === paymentReference) ||
                                (c.ci && c.ci === paymentReference) ||
                                (c.ciRif && c.ciRif === paymentReference) ||
                                (c.idNumber && c.idNumber === paymentReference)
                              ) || (customerType === 'client' ? clients.find(c => c.id === selectedClientId) : null);
                              const initialPct = getClientLevelPct(foundClient?.loyaltyPoints || 0);
                              return (
                                <div className="mb-4 p-3 border border-amber-500/30 bg-amber-500/5 rounded animate-in fade-in space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-editorial-text-muted uppercase tracking-widest font-mono">Inicial Requerida ({initialPct * 100}%)</span>
                                    <span className="text-xs font-bold text-amber-500">${(total * initialPct).toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-editorial-text-muted uppercase tracking-widest font-mono">A Financiar</span>
                                    <span className="text-xs font-bold text-editorial-text-primary">${(total * (1 - initialPct)).toFixed(2)}</span>
                                  </div>
                                  <div className="h-px bg-amber-500/20 my-1"></div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-editorial-text-muted uppercase tracking-widest font-mono">Cuotas Sugeridas</span>
                                    <span className="text-[10px] font-bold text-amber-500 uppercase">
                                      {(() => {
                                        const c = getKaluInstallmentsCount(kaluCreditType, foundClient?.loyaltyPoints || 0);
                                        return `${c}x $${( (total * (1 - initialPct)) / c ).toFixed(2)}`;
                                      })()}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()
                          )}

                          {/* Cédula Input for Mundo Kalu directly above the button */}
                          {paymentMethod === 'Mundo Kalu' && (
                             <div className="mb-3 animate-in fade-in">
                                <input
                                  type="text"
                                  value={paymentReference}
                                  onChange={(e) => setPaymentReference(e.target.value)}
                                  placeholder="Cédula del cliente..."
                                  className="w-full h-10 px-3 bg-editorial-card border border-amber-500/50 rounded text-sm text-editorial-text-primary focus:outline-none focus:border-amber-500 font-mono"
                                />
                             </div>
                          )}
                          
                          <button
                            type="button"
                            onClick={handleAddPayment}
                            className="w-full h-10 border border-amber-500 text-amber-500 font-mono text-[11px] font-bold tracking-widest uppercase hover:bg-amber-500 hover:text-black transition-colors cursor-pointer rounded"
                          >
                            + AGREGAR ABONO A LA CUENTA
                          </button>
                       </div>

                       {/* Credit Toggle */}
                       {(customerType === 'client' || customerType === 'supplier') && (
                         <div className="mt-auto">
                            <button
                              type="button"
                              onClick={() => setIsCreditSale(!isCreditSale)}
                              className={`w-full py-3 px-4 flex items-center justify-between rounded border transition-all cursor-pointer ${
                                isCreditSale
                                  ? 'bg-amber-500/10 border-amber-500 text-amber-500'
                                  : 'bg-editorial-bg border-editorial-border text-editorial-text-muted hover:text-editorial-text-primary hover:border-editorial-border/80'
                              }`}
                            >
                              <span className="font-mono text-[11px] font-bold uppercase tracking-wider">
                                {customerType === 'client' ? 'VENTA A CRÉDITO / FIADO' : 'LIBRETA QUESERO'}
                              </span>
                              <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                                isCreditSale ? 'border-amber-500 bg-amber-500' : 'border-editorial-text-muted'
                              }`}>
                                {isCreditSale && <div className="w-2 h-2 bg-black rounded-sm" />}
                              </div>
                            </button>
                            {isCreditSale && (
                               <p className="text-[9px] text-editorial-text-muted mt-2 font-mono">
                                 Nota: El monto restante de ${(total - totalAbonado).toFixed(2)} (Bs {((total - totalAbonado) * exchangeRate).toFixed(2)}) se enviará a cuenta por cobrar automáticamente.
                               </p>
                            )}
                         </div>
                       )}
                     </div>
                  </div>

                  {/* Action Buttons Footer */}
                  <form onSubmit={handleProcessSaleSubmit} className="pt-6 mt-6 border-t border-editorial-border/60 flex items-center justify-end gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPaymentModalOpen(false);
                        setCart([]);
                        setSelectedClientId('');
                        setSelectedSupplierId('');
                        setClientSearchText('');
                        setSupplierSearchText('');
                        setAddedPayments([]);
                        setIsCreditSale(false);
                        onAddNotification('Factura congelada y carrito limpiado exitosamente.', 'info');
                      }}
                      className="h-12 px-6 bg-editorial-bg border border-editorial-border text-editorial-text-primary font-serif font-bold text-[11px] tracking-widest uppercase hover:bg-editorial-card transition-all cursor-pointer rounded"
                    >
                      Congelar Factura
                    </button>
                    
                    <button
                      type="submit"
                      disabled={isProcessing || (!isCreditSale && totalAbonado < total)}
                      className="h-12 px-8 bg-amber-500 text-black font-serif font-bold text-[13px] tracking-widest uppercase flex items-center justify-center gap-2 hover:brightness-110 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>{isProcessing ? 'PROCESANDO...' : 'FACTURAR / CONFIRMAR VENTA (F4)'}</span>
                    </button>
                  </form>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-editorial-card border border-editorial-border rounded p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-serif text-2xl font-bold text-editorial-text-primary tracking-tight">
              Historial Crítico de Ventas
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono bg-editorial-bg border border-editorial-border px-3 py-1 rounded">
                VENTAS HOY: {dailySalesCount}
              </span>
              <span className="text-[10px] font-mono bg-amber-500/10 text-amber-500 border border-amber-500/30 px-3 py-1 rounded font-bold">
                INGRESOS HOY: ${dailyRevenue.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-editorial-border text-[10px] font-mono text-editorial-text-muted uppercase tracking-wider">
                  <th className="py-3 px-4">Referencia</th>
                  <th className="py-3 px-4">Fecha y Hora</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Artículos</th>
                  <th className="py-3 px-4">Método</th>
                  <th className="py-3 px-4 text-right">Monto Total</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-editorial-border/60 font-sans">
                {currentShiftSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-editorial-text-muted">
                      No se han procesado ventas en esta sesión.
                    </td>
                  </tr>
                ) : (
                  currentShiftSales.map((s) => (
                    <tr key={s.id} className="hover:bg-editorial-bg/40 transition-all">
                      <td className="py-3.5 px-4 font-mono font-bold text-editorial-text-primary">{s.invoiceNumber || s.id}</td>
                      <td className="py-3.5 px-4 text-editorial-text-muted">{s.date}</td>
                      <td className="py-3.5 px-4 font-medium">{s.clientName || s.entity || 'Cliente General'}</td>
                      <td className="py-3.5 px-4 text-editorial-text-muted max-w-[200px] truncate">
                        {s.items ? s.items.map((it: any) => `${it.name} (${it.quantityKg || it.quantity || 1} ${it.unit ? getUnitLabel(it).toLowerCase() : 'kg'})`).join(', ') : (s.notes || 'Varios Artículos')}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono border border-editorial-border bg-editorial-bg">
                          {s.paymentMethod || 'Efectivo'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-500">${(s.total || s.amount || 0).toFixed(2)}</td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setLastReceipt(s)}
                            className="px-2.5 py-1 text-[9px] font-mono border border-editorial-border hover:border-amber-500 hover:text-amber-500 rounded bg-editorial-card transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" />
                            Ver Ticket
                          </button>
                          {!s.isVoided && onVoidSale && (
                            <button
                              onClick={() => setTransactionToVoid(s)}
                              className="px-2.5 py-1 text-[9px] font-mono border border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white rounded transition-all cursor-pointer inline-flex items-center gap-1"
                              title="Anular Venta"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Anular
                            </button>
                          )}
                          {s.isVoided && (
                            <span className="px-2.5 py-1 text-[9px] font-mono font-bold text-rose-500 uppercase tracking-widest">
                              Anulada
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'closing' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Form and parameters */}
          <div className="lg:col-span-7 bg-editorial-card border border-editorial-border rounded p-6 space-y-6">
            <h3 className="font-serif text-2xl font-bold text-editorial-text-primary tracking-tight">
              Arqueo &amp; Cuadre de Caja
            </h3>

            {isClosed ? (
              <div className="py-8 text-center space-y-3">
                <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
                <h4 className="font-serif text-xl font-bold text-editorial-text-primary">Caja Cerrada Exitosamente</h4>
                <p className="text-xs text-editorial-text-muted max-w-sm mx-auto">
                  La caja ha sido cerrada para este turno. El informe contable fue transmitido a auditoría.
                </p>
                <button
                  onClick={() => {
                    setIsClosed(false);
                    setClosingReport(null);
                  }}
                  className="mt-4 px-4 py-2 border border-editorial-border text-[10px] font-mono font-bold uppercase tracking-wider text-editorial-text-primary hover:bg-editorial-bg cursor-pointer"
                >
                  Abrir Nueva Caja
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Columna USD */}
                  <div className="space-y-4">
                    <h4 className="font-serif text-lg font-bold text-amber-500 uppercase">Gaveta USD ($)</h4>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                        Fondo Inicial USD (Apertura)
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={startingCashUsdInput}
                          onChange={(e) => setStartingCashUsdInput(e.target.value)}
                          placeholder="0.00"
                          className="w-full h-10 pl-3 pr-16 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={handleSaveStartingCashUsd}
                          className="absolute right-1.5 px-2.5 py-1 bg-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-black text-[10px] font-mono font-bold rounded transition-colors uppercase cursor-pointer"
                        >
                          Fijar
                        </button>
                      </div>
                    </div>
                    
                    <div className="bg-editorial-bg border border-editorial-border rounded p-4 font-mono text-xs space-y-2.5">
                      <div className="flex justify-between text-editorial-text-muted">
                        <span>Fondo Inicial USD:</span>
                        <span className="text-editorial-text-primary">${startingCashUsd.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-editorial-text-muted">
                        <span>(+) Ventas Efectivo USD:</span>
                        <span className="text-amber-400">+${salesCashUsd.toFixed(2)}</span>
                      </div>
                      {incomeCashUsd > 0 && (
                        <div className="flex justify-between text-editorial-text-muted">
                          <span>(+) Abonos Efectivo USD:</span>
                          <span className="text-amber-400">+${incomeCashUsd.toFixed(2)}</span>
                        </div>
                      )}
                      {expensesCashUsd > 0 && (
                        <div className="flex justify-between text-editorial-text-muted">
                          <span>(-) Gastos Efectivo USD:</span>
                          <span className="text-rose-400">-${expensesCashUsd.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold border-t border-editorial-border/40 pt-2 text-editorial-text-primary">
                        <span>(=) Esperado en Gaveta USD:</span>
                        <span>${expectedUsd.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                        Efectivo Real Contado USD
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={actualCashUsd}
                        onChange={(e) => setActualCashUsd(parseSafeDecimal(e.target.value) || 0)}
                        className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className={`bg-editorial-bg border border-editorial-border rounded p-3 text-center font-bold text-sm ${
                      diffUsd === 0 ? 'text-amber-400' : diffUsd > 0 ? 'text-blue-400' : 'text-rose-400'
                    }`}>
                      {diffUsd === 0 ? 'Cuadre USD Perfecto ($0.00)' : `${diffUsd > 0 ? 'Sobrante USD' : 'Faltante USD'} de $${Math.abs(diffUsd).toFixed(2)}`}
                    </div>
                  </div>

                  {/* Columna Bs */}
                  <div className="space-y-4">
                    <h4 className="font-serif text-lg font-bold text-amber-500 uppercase">Gaveta Bs</h4>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                        Fondo Inicial Bs (Apertura)
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={startingCashBsInput}
                          onChange={(e) => setStartingCashBsInput(e.target.value)}
                          placeholder="0.00"
                          className="w-full h-10 pl-3 pr-16 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={handleSaveStartingCashBs}
                          className="absolute right-1.5 px-2.5 py-1 bg-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-black text-[10px] font-mono font-bold rounded transition-colors uppercase cursor-pointer"
                        >
                          Fijar
                        </button>
                      </div>
                    </div>

                    <div className="bg-editorial-bg border border-editorial-border rounded p-4 font-mono text-xs space-y-2.5">
                      <div className="flex justify-between text-editorial-text-muted">
                        <span>Fondo Inicial Bs:</span>
                        <span className="text-editorial-text-primary">Bs {startingCashBs.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-editorial-text-muted">
                        <span>(+) Ventas Efectivo Bs:</span>
                        <span className="text-amber-400">+Bs {salesCashBs.toFixed(2)}</span>
                      </div>
                      {incomeCashBs > 0 && (
                        <div className="flex justify-between text-editorial-text-muted">
                          <span>(+) Abonos Efectivo Bs:</span>
                          <span className="text-amber-400">+Bs {incomeCashBs.toFixed(2)}</span>
                        </div>
                      )}
                      {expensesCashBs > 0 && (
                        <div className="flex justify-between text-editorial-text-muted">
                          <span>(-) Gastos Efectivo Bs:</span>
                          <span className="text-rose-400">-Bs {expensesCashBs.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold border-t border-editorial-border/40 pt-2 text-editorial-text-primary">
                        <span>(=) Esperado en Gaveta Bs:</span>
                        <span>Bs {expectedBs.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono tracking-wider text-editorial-text-muted uppercase block">
                        Efectivo Real Contado Bs
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={actualCashBs}
                        onChange={(e) => setActualCashBs(parseSafeDecimal(e.target.value) || 0)}
                        className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded text-xs text-editorial-text-primary font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className={`bg-editorial-bg border border-editorial-border rounded p-3 text-center font-bold text-sm ${
                      diffBs === 0 ? 'text-amber-400' : diffBs > 0 ? 'text-blue-400' : 'text-rose-400'
                    }`}>
                      {diffBs === 0 ? 'Cuadre Bs Perfecto' : `${diffBs > 0 ? 'Sobrante Bs' : 'Faltante Bs'} de Bs ${Math.abs(diffBs).toFixed(2)}`}
                    </div>
                  </div>
                </div>

                {(() => {
                  const isShiftEmpty = currentShiftSales.length === 0 && currentShiftTransactions.length === 0;
                  return (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={handlePerformClosing}
                        disabled={isClosingDrawer || isShiftEmpty}
                        className={`w-full h-12 bg-amber-500 text-white font-serif font-bold text-md tracking-tight transition-all flex items-center justify-center gap-2 ${isClosingDrawer || isShiftEmpty ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-110 cursor-pointer'}`}
                      >
                        <CheckCircle className="w-4 h-4" />
                        {isClosingDrawer ? '⏳ Procesando Cierre...' : 'Realizar Cierre de Caja Diario'}
                      </button>
                      {isShiftEmpty && (
                        <div className="text-center text-[10px] uppercase text-amber-500 font-bold tracking-wider">
                          Turno en $0.00 - Esperando movimientos
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Report output column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-editorial-card border border-editorial-border rounded p-6 space-y-4">
              <h4 className="font-serif text-lg font-bold text-editorial-text-primary tracking-tight">Tarjetas de Resumen</h4>
              <div className="font-mono text-xs grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col p-3 bg-editorial-bg rounded border border-editorial-border">
                  <span className="text-[10px] uppercase text-editorial-text-muted">💳 Punto de Venta</span>
                  <span className="font-bold text-editorial-text-primary text-lg">Bs. {totalCard.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                  <span className="text-[9px] text-editorial-text-muted">Eq. ${(totalCard / (exchangeRate || 1)).toFixed(2)} USD</span>
                </div>
                <div className="flex flex-col p-3 bg-editorial-bg rounded border border-editorial-border">
                  <span className="text-[10px] uppercase text-editorial-text-muted">📲 Pago Móvil</span>
                  <span className="font-bold text-editorial-text-primary text-lg">Bs. {totalMobile.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                  <span className="text-[9px] text-editorial-text-muted">Eq. ${(totalMobile / (exchangeRate || 1)).toFixed(2)} USD</span>
                </div>
                <div className="flex flex-col p-3 bg-editorial-bg rounded border border-editorial-border">
                  <span className="text-[10px] uppercase text-editorial-text-muted">🧬 Biopago</span>
                  <span className="font-bold text-editorial-text-primary text-lg">Bs. {totalBiopago.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                  <span className="text-[9px] text-editorial-text-muted">Eq. ${(totalBiopago / (exchangeRate || 1)).toFixed(2)} USD</span>
                </div>
                <div className="flex flex-col p-3 bg-editorial-bg rounded border border-editorial-border">
                  <span className="text-[10px] uppercase text-editorial-text-muted">💵 Efectivo Bs</span>
                  <span className="font-bold text-editorial-text-primary text-lg">Bs. {totalCashBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="col-span-1 md:col-span-2 flex flex-col p-3 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded">
                  <span className="text-[10px] uppercase">📋 Total Fiado Hoy</span>
                  <span className="font-bold text-lg">${totalCreditSales.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {closingReport && (
              <div className="bg-editorial-card border border-editorial-border rounded p-6 font-mono text-xs text-editorial-text-primary space-y-4 relative">
                <div className="text-center space-y-1">
                  <h4 className="font-serif text-md font-extrabold uppercase tracking-tight">REGISTRO DE CIERRE</h4>
                  <p className="text-[10px] text-editorial-text-muted">{closingReport.date} • {closingReport.id}</p>
                </div>

                <div className="border-t border-dashed border-editorial-border/60 my-2" />

                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Fondo Apertura USD:</span>
                    <span>${closingReport.startingCashUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-editorial-text-primary pt-1 border-t border-editorial-border/30">
                    <span>Total Teórico Gaveta USD:</span>
                    <span>${closingReport.expectedUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Contado Real USD:</span>
                    <span>${closingReport.actualCashUsd.toFixed(2)}</span>
                  </div>
                  
                  <div className="border-t border-dashed border-editorial-border/30 my-2" />
                  
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Fondo Apertura Bs:</span>
                    <span>Bs {closingReport.startingCashBs.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-editorial-text-primary pt-1 border-t border-editorial-border/30">
                    <span>Total Teórico Gaveta Bs:</span>
                    <span>Bs {closingReport.expectedBs.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Contado Real Bs:</span>
                    <span>Bs {closingReport.actualCashBs.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-editorial-border/60 my-2" />

                <div className="flex justify-between font-bold text-xs pt-1">
                  <span className="text-editorial-text-muted">Resultado:</span>
                  <span className={closingReport.status === 'Balance Perfecto' ? 'text-amber-400' : 'text-rose-400'}>
                    {closingReport.status}
                  </span>
                </div>
              </div>
            )}

            {/* Tarjeta del Último Cierre (Si hay alguno en el historial) */}
            {closingsHistory.length > 0 && activeTab === 'closing' && (
              <div className="bg-editorial-bg border border-editorial-border rounded p-6 font-mono text-xs mt-4">
                <h4 className="font-serif text-sm font-bold text-editorial-text-primary uppercase mb-3 flex items-center gap-2"><Archive className="w-4 h-4 text-amber-500" /> Último Cierre Registrado</h4>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Fecha y Hora:</span>
                    <span className="text-editorial-text-primary font-bold">{new Date(closingsHistory[0].timestamp).toLocaleString('es-ES')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Reporte:</span>
                    <span className="text-editorial-text-primary">{closingsHistory[0].id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Recaudado USD:</span>
                    <span className="text-amber-400 font-bold">${(closingsHistory[0].totalCashUsd || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-editorial-border/30 pt-1.5 mt-1.5">
                    <span className="text-editorial-text-muted">Estado del Cuadre:</span>
                    <span className={`font-bold ${closingsHistory[0].status === 'Balance Perfecto' ? 'text-amber-400' : 'text-rose-400'}`}>
                      {closingsHistory[0].status}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'closing_history' && (
        <div className="bg-editorial-card border border-editorial-border rounded p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-serif text-2xl font-bold text-editorial-text-primary tracking-tight">
              Historial de Cierres de Caja
            </h3>
            <div className="flex gap-4 items-center">
              {selectedClosings.length > 0 && (
                <button
                  onClick={handlePurgeSelectedClosings}
                  disabled={isPurgingClosings}
                  className="px-4 py-2 bg-rose-500/20 text-rose-400 border border-rose-500/50 hover:bg-rose-500/30 rounded font-bold text-xs uppercase tracking-wider flex items-center gap-2"
                >
                  <span className="flex items-center justify-center w-4 h-4">
                    {isPurgingClosings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </span>
                  <span>Compactar Seleccionados ({selectedClosings.length})</span>
                </button>
              )}
              <input
                type="date"
                value={closingSearchDate}
                onChange={(e) => {
                  setClosingSearchDate(e.target.value);
                  setClosingPage(1);
                }}
                className="bg-editorial-bg border border-editorial-border text-editorial-text-primary px-3 py-1.5 rounded text-sm outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-editorial-border text-[10px] font-mono text-editorial-text-muted uppercase tracking-wider">
                  <th className="py-3 px-4 w-10 text-center">
                    <input 
                      type="checkbox" 
                      checked={(() => {
                        const filtered = closingsHistory.filter(c => !closingSearchDate || (new Date(c.timestamp?.seconds ? c.timestamp.seconds * 1000 : c.timestamp).toISOString().split('T')[0] === closingSearchDate));
                        const pageData = filtered.slice((closingPage - 1) * 15, closingPage * 15);
                        return pageData.length > 0 && pageData.every(c => selectedClosings.includes(c.id));
                      })()}
                      onChange={() => {
                        const filtered = closingsHistory.filter(c => !closingSearchDate || (new Date(c.timestamp?.seconds ? c.timestamp.seconds * 1000 : c.timestamp).toISOString().split('T')[0] === closingSearchDate));
                        const pageData = filtered.slice((closingPage - 1) * 15, closingPage * 15);
                        const isAllSelected = pageData.length > 0 && pageData.every(c => selectedClosings.includes(c.id));
                        if (isAllSelected) {
                          setSelectedClosings(prev => prev.filter(id => !pageData.find(c => c.id === id)));
                        } else {
                          const newIds = pageData.map(c => c.id).filter(id => !selectedClosings.includes(id));
                          setSelectedClosings(prev => [...prev, ...newIds]);
                        }
                      }}
                      className="accent-amber-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Fecha / Hora</th>
                  <th className="py-3 px-4">Total Ventas</th>
                  <th className="py-3 px-4">Efectivo USD</th>
                  <th className="py-3 px-4">Efectivo BS</th>
                  <th className="py-3 px-4">Pago Móvil</th>
                  <th className="py-3 px-4">Fiado</th>
                  <th className="py-3 px-4">Tasa</th>
                  <th className="py-3 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-editorial-border/60 font-sans">
                {(() => {
                  const filtered = closingsHistory.filter(c => !closingSearchDate || (new Date(c.timestamp?.seconds ? c.timestamp.seconds * 1000 : c.timestamp).toISOString().split('T')[0] === closingSearchDate));
                  const pageData = filtered.slice((closingPage - 1) * 15, closingPage * 15);
                  if (pageData.length === 0) {
                    return (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-editorial-text-muted">
                          No hay cierres encontrados.
                        </td>
                      </tr>
                    );
                  }
                  return pageData.map((c) => {
                    const totalVentas = (c.salesCashUsd || 0) + ((c.salesCashBs || 0) / (c.bcvRateAtClose || exchangeRate || 1)) + (c.totalCard || 0) + (c.totalMobile || 0) + (c.totalBiopago || 0) + (c.totalCreditSales || 0);
                    return (
                      <tr key={c.id} className="hover:bg-editorial-bg/40 transition-all">
                        <td className="py-3.5 px-4 text-center">
                          <input 
                            type="checkbox" 
                            checked={selectedClosings.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedClosings(prev => [...prev, c.id]);
                              else setSelectedClosings(prev => prev.filter(id => id !== c.id));
                            }}
                            className="accent-amber-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {new Date(c.timestamp?.seconds ? c.timestamp.seconds * 1000 : c.timestamp).toLocaleString('es-ES')}
                          {c.purged && <span className="ml-2 px-1.5 py-0.5 rounded text-[8px] bg-neutral-700 text-neutral-300 border border-neutral-600 uppercase">Purgado</span>}
                        </td>
                        <td className="py-3.5 px-4 text-emerald-400 font-bold font-mono">${totalVentas.toFixed(2)}</td>
                        <td className="py-3.5 px-4 font-mono">${(c.salesCashUsd || 0).toFixed(2)}</td>
                        <td className="py-3.5 px-4 font-mono">Bs. {(c.salesCashBs || 0).toFixed(2)}</td>
                        <td className="py-3.5 px-4 font-mono">${(c.totalMobile || 0).toFixed(2)}</td>
                        <td className="py-3.5 px-4 font-mono text-amber-500">${(c.totalCreditSales || 0).toFixed(2)}</td>
                        <td className="py-3.5 px-4 font-mono text-editorial-text-muted">Bs. {(c.bcvRateAtClose || exchangeRate || 1).toFixed(2)}</td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => setSelectedAuditClosing(c)}
                            className="px-3 py-1.5 text-[10px] font-mono border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black rounded transition-all cursor-pointer inline-flex items-center gap-1.5 font-bold uppercase tracking-wider"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Ver Detalle
                          </button>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {(() => {
            const filtered = closingsHistory.filter(c => !closingSearchDate || (new Date(c.timestamp?.seconds ? c.timestamp.seconds * 1000 : c.timestamp).toISOString().split('T')[0] === closingSearchDate));
            const totalPages = Math.ceil(filtered.length / 15);
            if (totalPages <= 1) return null;
            return (
              <div className="mt-4 flex justify-between items-center text-xs font-mono">
                <span className="text-editorial-text-muted">Página {closingPage} de {totalPages}</span>
                <div className="flex gap-2">
                  <button 
                    disabled={closingPage === 1}
                    onClick={() => setClosingPage(p => p - 1)}
                    className="px-3 py-1 bg-editorial-bg border border-editorial-border rounded disabled:opacity-50 hover:bg-editorial-border/50"
                  >Anterior</button>
                  <button 
                    disabled={closingPage === totalPages}
                    onClick={() => setClosingPage(p => p + 1)}
                    className="px-3 py-1 bg-editorial-bg border border-editorial-border rounded disabled:opacity-50 hover:bg-editorial-border/50"
                  >Siguiente</button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Ticket Preview Modal */}
      {lastReceipt && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-editorial-bg border border-editorial-border rounded w-full max-w-sm flex flex-col shadow-2xl overflow-hidden animate-slide-up print-ticket">
            
            {/* Modal Header (No print) */}
            <div className="flex items-center justify-between p-4 bg-editorial-card border-b border-editorial-border/60 no-print">
              <h3 className="font-serif font-bold text-editorial-text-primary text-lg">Ticket de Venta</h3>
              <button 
                onClick={() => setLastReceipt(null)}
                className="text-editorial-text-muted hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ticket Printable Content */}
            <div className="p-6 bg-white text-black font-mono text-xs space-y-4 relative overflow-y-auto max-h-[60vh]" id="ticket-printable-area">
              <div className="text-center space-y-1 pb-4 border-b border-dashed border-gray-400">
                <h2 className="font-bold text-lg uppercase tracking-tight">Kalu Comercializadora</h2>
                <p className="text-[10px]">C.A. / RIF: J-00000000-0</p>
                <p className="text-[10px] mt-2 font-bold uppercase">{lastReceipt.invoiceNumber || lastReceipt.id}</p>
                <p className="text-[10px]">{lastReceipt.date}</p>
              </div>

              <div className="space-y-1">
                <p><span className="font-bold">Cliente:</span> {lastReceipt.clientName || lastReceipt.entity || 'Cliente Público'}</p>
                <p><span className="font-bold">Método:</span> {lastReceipt.paymentMethod || 'Efectivo'}</p>
              </div>

              <div className="border-t border-dashed border-gray-400 my-2" />
              
              <table className="w-full text-left text-[10px]">
                <thead>
                  <tr className="border-b border-dashed border-gray-400">
                    <th className="py-1">CANT</th>
                    <th className="py-1">PRODUCTO</th>
                    <th className="py-1 text-right">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-gray-200">
                  {lastReceipt.items && lastReceipt.items.length > 0 ? (
                    lastReceipt.items.map((it: any, idx: number) => (
                      <tr key={idx}>
                        <td className="py-1.5 align-top">{it.quantityKg || it.quantity || 1}</td>
                        <td className="py-1.5 align-top pr-2">{it.name} <br/><span className="text-[9px] text-gray-500">${parseNum(it.pricePerKg).toFixed(2)}/{it.unit ? getUnitLabel(it).toLowerCase() : 'kg'}</span></td>
                        <td className="py-1.5 align-top text-right">${parseNum(it.subtotal).toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-2 text-center text-gray-500 italic">{lastReceipt.notes || 'Varios Artículos'}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="border-t border-dashed border-gray-400 my-2" />

              <div className="space-y-1 text-right">
                {(() => {
                  const activeTaxRate = settings?.taxRate !== undefined ? settings.taxRate : 5;
                  const divisor = 1 + (activeTaxRate / 100);
                  const receiptTotal = parseNum(lastReceipt.amount || lastReceipt.total);
                  const receiptSubtotal = lastReceipt.subtotal !== undefined ? parseNum(lastReceipt.subtotal) : receiptTotal / divisor;
                  const receiptTax = lastReceipt.tax !== undefined ? parseNum(lastReceipt.tax) : receiptTotal - receiptSubtotal;
                  
                  return (
                    <>
                      <p className="text-[11px]">Subtotal: ${receiptSubtotal.toFixed(2)}</p>
                      <p className="text-[11px]">IVA ({activeTaxRate}%): ${receiptTax.toFixed(2)}</p>
                      <p className="text-lg font-bold mt-1 uppercase">Total: ${receiptTotal.toFixed(2)}</p>
                      <p className="text-xs font-bold text-gray-600">Bs. {(receiptTotal * exchangeRate).toFixed(2)}</p>
                    </>
                  );
                })()}
              </div>

              <div className="text-center pt-6 text-[9px] text-gray-500 uppercase">
                <p>¡Gracias por su compra!</p>
                <p>kalu.com.ve</p>
              </div>
            </div>

            {/* Modal Footer actions (No print) */}
            <div className="p-4 bg-editorial-card border-t border-editorial-border/60 flex gap-3 no-print">
              <button
                onClick={() => setLastReceipt(null)}
                className="flex-1 px-4 py-2 border border-editorial-border text-editorial-text-primary text-xs font-bold uppercase tracking-wider rounded hover:bg-editorial-bg transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={() => window.print()}
                className="flex-1 px-4 py-2 bg-amber-500 hover:brightness-110 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Modal */}
      {isChangeModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="bg-editorial-card border border-editorial-border rounded w-full max-w-lg flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 bg-editorial-bg border-b border-editorial-border">
              <h3 className="font-serif font-bold text-amber-500 text-lg">💵 Entrega de Cambio / Vuelto</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="bg-editorial-bg border border-editorial-border rounded p-4 text-center font-mono space-y-2">
                <div className="flex justify-between text-sm text-editorial-text-muted">
                  <span>Total Venta:</span>
                  <span>${total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-editorial-text-muted">
                  <span>Total Recibido:</span>
                  <span>${totalAbonado.toFixed(2)}</span>
                </div>
                <div className="h-px bg-editorial-border/60 my-2" />
                <div className="flex justify-between text-lg font-bold text-amber-500">
                  <span>Vuelto Obligatorio:</span>
                  <div className="text-right">
                    <div>${(totalAbonado - total).toFixed(2)}</div>
                    <div className="text-xs text-amber-500/70">Bs. {((totalAbonado - total) * exchangeRate).toFixed(2)} a tasa actual</div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <p className="font-mono text-xs text-editorial-text-muted uppercase tracking-widest text-center">Seleccione la moneda de entrega</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setChangeCurrency('USD')}
                    className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${changeCurrency === 'USD' ? 'border-emerald-400/50 bg-emerald-400/20 shadow-lg scale-105' : 'border-editorial-border bg-editorial-card opacity-70 hover:opacity-100'}`}
                  >
                    <Banknote className={`w-6 h-6 ${changeCurrency === 'USD' ? 'text-emerald-400' : 'text-editorial-text-muted'}`} />
                    <div className="flex flex-col items-center">
                      <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${changeCurrency === 'USD' ? 'text-emerald-400' : 'text-editorial-text-primary'}`}>Efectivo USD</span>
                      <span className={`text-xs font-bold ${changeCurrency === 'USD' ? 'text-emerald-400' : 'text-editorial-text-muted'}`}>${(totalAbonado - total).toFixed(2)}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChangeCurrency('BS')}
                    className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${changeCurrency === 'BS' ? 'border-lime-400/50 bg-lime-400/20 shadow-lg scale-105' : 'border-editorial-border bg-editorial-card opacity-70 hover:opacity-100'}`}
                  >
                    <Coins className={`w-6 h-6 ${changeCurrency === 'BS' ? 'text-lime-400' : 'text-editorial-text-muted'}`} />
                    <div className="flex flex-col items-center">
                      <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${changeCurrency === 'BS' ? 'text-lime-400' : 'text-editorial-text-primary'}`}>Efectivo Bs</span>
                      <span className={`text-xs font-bold ${changeCurrency === 'BS' ? 'text-lime-400' : 'text-editorial-text-muted'}`}>Bs. {((totalAbonado - total) * exchangeRate).toFixed(2)}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChangeCurrency('PAGO_MOVIL')}
                    className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${changeCurrency === 'PAGO_MOVIL' ? 'border-violet-400/50 bg-violet-400/20 shadow-lg scale-105' : 'border-editorial-border bg-editorial-card opacity-70 hover:opacity-100'}`}
                  >
                    <Smartphone className={`w-6 h-6 ${changeCurrency === 'PAGO_MOVIL' ? 'text-violet-400' : 'text-editorial-text-muted'}`} />
                    <div className="flex flex-col items-center">
                      <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${changeCurrency === 'PAGO_MOVIL' ? 'text-violet-400' : 'text-editorial-text-primary'}`}>Pago Móvil</span>
                      <span className={`text-xs font-bold ${changeCurrency === 'PAGO_MOVIL' ? 'text-violet-400' : 'text-editorial-text-muted'}`}>Bs. {((totalAbonado - total) * exchangeRate).toFixed(2)}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChangeCurrency('MIXED')}
                    className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${changeCurrency === 'MIXED' ? 'border-amber-400/50 bg-amber-400/20 shadow-lg scale-105' : 'border-editorial-border bg-editorial-card opacity-70 hover:opacity-100'}`}
                  >
                    <Layers className={`w-6 h-6 ${changeCurrency === 'MIXED' ? 'text-amber-400' : 'text-editorial-text-muted'}`} />
                    <div className="flex flex-col items-center">
                      <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${changeCurrency === 'MIXED' ? 'text-amber-400' : 'text-editorial-text-primary'}`}>Mixto</span>
                      <span className={`text-[9px] font-mono ${changeCurrency === 'MIXED' ? 'text-amber-400/70' : 'text-editorial-text-muted'}`}>Múltiples</span>
                    </div>
                  </button>
                </div>
                
                {changeCurrency === 'PAGO_MOVIL' && (
                  <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                    <input
                      type="text"
                      placeholder="Referencia de Pago Móvil (Opcional)"
                      value={changeReference}
                      onChange={(e) => setChangeReference(e.target.value)}
                      className="w-full bg-editorial-bg border border-violet-500/50 rounded px-3 py-2 text-sm text-violet-400 placeholder:text-violet-400/30 focus:outline-none focus:border-violet-500 font-mono"
                    />
                  </div>
                )}

                {changeCurrency === 'MIXED' && (() => {
                  const reqUsd = parseNum((totalAbonado - total).toFixed(2));
                  const u = parseNum(mixedChangeUsd);
                  const b = parseNum(mixedChangeBs) / (exchangeRate || 1);
                  const m = parseNum(mixedChangeMobile) / (exchangeRate || 1);
                  const sumUsd = parseNum((u + b + m).toFixed(2));
                  const pendingUsd = Math.max(0, reqUsd - sumUsd);
                  const pendingBs = pendingUsd * (exchangeRate || 1);

                  return (
                    <div className="pt-2 grid gap-3 animate-in fade-in slide-in-from-top-2">
                      <div className="bg-editorial-bg border border-amber-500/30 rounded p-2 text-center flex justify-between px-4 items-center">
                        <span className="text-xs text-editorial-text-muted font-mono uppercase">Pendiente:</span>
                        <div className="text-right font-mono">
                          <span className={`text-sm font-bold ${pendingUsd === 0 ? 'text-emerald-400' : 'text-amber-500'} mr-2`}>${pendingUsd.toFixed(2)}</span>
                          <span className={`text-xs ${pendingUsd === 0 ? 'text-emerald-400/70' : 'text-amber-500/70'}`}>Bs. {pendingBs.toFixed(2)}</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-emerald-400 font-mono uppercase">USD ($)</label>
                            {pendingUsd > 0 && (
                              <button type="button" onClick={() => setMixedChangeUsd(parseNum((u + pendingUsd).toFixed(2)).toString())} className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded hover:bg-emerald-500/40">Completar</button>
                            )}
                          </div>
                          <input
                            type="text"
                            value={mixedChangeUsd}
                            onChange={(e) => setMixedChangeUsd(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-editorial-bg border border-emerald-500/50 rounded px-2 py-1 text-sm text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-lime-400 font-mono uppercase">Bs Efectivo</label>
                            {pendingUsd > 0 && (
                              <button type="button" onClick={() => setMixedChangeBs(parseNum((parseNum(mixedChangeBs) + pendingBs).toFixed(2)).toString())} className="text-[9px] bg-lime-500/20 text-lime-400 px-1 rounded hover:bg-lime-500/40">Completar</button>
                            )}
                          </div>
                          <input
                            type="text"
                            value={mixedChangeBs}
                            onChange={(e) => setMixedChangeBs(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-editorial-bg border border-lime-500/50 rounded px-2 py-1 text-sm text-lime-400 focus:outline-none focus:border-lime-500 font-mono"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-violet-400 font-mono uppercase">Pago Móvil</label>
                            {pendingUsd > 0 && (
                              <button type="button" onClick={() => setMixedChangeMobile(parseNum((parseNum(mixedChangeMobile) + pendingBs).toFixed(2)).toString())} className="text-[9px] bg-violet-500/20 text-violet-400 px-1 rounded hover:bg-violet-500/40">Completar</button>
                            )}
                          </div>
                          <input
                            type="text"
                            value={mixedChangeMobile}
                            onChange={(e) => setMixedChangeMobile(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-editorial-bg border border-violet-500/50 rounded px-2 py-1 text-sm text-violet-400 focus:outline-none focus:border-violet-500 font-mono"
                          />
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Referencia Pago Móvil"
                        value={mixedChangeMobileRef}
                        onChange={(e) => setMixedChangeMobileRef(e.target.value)}
                        className="w-full bg-editorial-bg border border-violet-500/30 rounded px-3 py-1.5 text-xs text-violet-400 placeholder:text-violet-400/30 focus:outline-none focus:border-violet-500 font-mono"
                      />
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="p-4 bg-editorial-bg border-t border-editorial-border flex gap-3">
              <button
                onClick={() => setIsChangeModalOpen(false)}
                className="flex-1 py-3 border border-editorial-border text-editorial-text-muted font-serif font-bold text-xs uppercase tracking-wider rounded hover:bg-editorial-card transition-colors"
              >
                Volver
              </button>
              <button
                onClick={() => {
                  if (changeCurrency === 'MIXED') {
                    const reqUsd = parseNum((totalAbonado - total).toFixed(2));
                    const u = parseNum(mixedChangeUsd);
                    const b = parseNum(mixedChangeBs) / (exchangeRate || 1);
                    const m = parseNum(mixedChangeMobile) / (exchangeRate || 1);
                    const sum = parseNum((u + b + m).toFixed(2));
                    if (Math.abs(sum - reqUsd) > 0.02) {
                      onAddNotification(`El vuelto mixto no coincide. Esperado: $${reqUsd.toFixed(2)}, Ingresado: $${sum.toFixed(2)}`, 'warning');
                      return;
                    }
                  }
                  setIsChangeModalOpen(false);
                  handleProcessSaleSubmit(undefined, true);
                }}
                className="flex-[2] py-3 bg-amber-500 text-black font-serif font-bold text-xs uppercase tracking-wider rounded hover:brightness-110 transition-colors"
              >
                ✅ Confirmar Vuelto y Emitir Ticket (F4/Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Confirmation Modal */}
      {transactionToVoid && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="bg-editorial-card border border-rose-500/50 rounded w-full max-w-md flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 bg-editorial-bg border-b border-editorial-border">
              <h3 className="font-serif font-bold text-rose-500 text-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Anular Venta
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-editorial-text-primary text-center">
                ¿Deseas anular la venta <span className="font-mono font-bold">{transactionToVoid.invoiceNumber || transactionToVoid.id}</span> por un total de <span className="font-mono font-bold text-amber-500">${(transactionToVoid.total || transactionToVoid.amount || 0).toFixed(2)}</span>?
              </p>
              <div className="bg-rose-500/10 border border-rose-500/30 rounded p-4 text-xs text-rose-400 text-center font-mono">
                Esta acción devolverá los productos al stock del inventario y restará el dinero del Arqueo de Caja de forma inmediata.
              </div>
            </div>
            <div className="p-4 bg-editorial-bg border-t border-editorial-border flex gap-3">
              <button
                onClick={() => setTransactionToVoid(null)}
                className="flex-1 py-3 border border-editorial-border text-editorial-text-muted font-serif font-bold text-xs uppercase tracking-wider rounded hover:bg-editorial-card transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (onVoidSale) {
                    onVoidSale(transactionToVoid.id, transactionToVoid.items || []);
                    onAddNotification(`Venta ${transactionToVoid.invoiceNumber || transactionToVoid.id} anulada exitosamente.`, 'success');
                  }
                  setTransactionToVoid(null);
                }}
                className="flex-1 py-3 bg-rose-500 text-white font-serif font-bold text-xs uppercase tracking-wider rounded hover:brightness-110 transition-colors flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Confirmar Anulación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {selectedAuditClosing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-editorial-card border border-editorial-border rounded w-11/12 max-w-5xl flex flex-col shadow-2xl overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between p-4 bg-editorial-bg border-b border-editorial-border">
              <h3 className="font-serif font-bold text-amber-500 text-lg flex items-center gap-2">
                <Archive className="w-5 h-5" />
                Auditoría de Cierre: {selectedAuditClosing.id}
              </h3>
              <button 
                onClick={() => setSelectedAuditClosing(null)}
                className="text-editorial-text-muted hover:text-rose-400 transition-colors p-1"
              >
                <span className="text-2xl leading-none">&times;</span>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6">
              
              <div className="grid grid-cols-4 gap-4 text-sm font-mono bg-editorial-bg p-4 border border-editorial-border rounded">
                <div>
                  <div className="text-[9px] text-editorial-text-muted uppercase tracking-wider mb-1">Cajero Responsable</div>
                  <div className="font-bold text-amber-500 uppercase">Administrador</div>
                </div>
                <div>
                  <div className="text-[9px] text-editorial-text-muted uppercase tracking-wider mb-1">Tasa BCV del Turno</div>
                  <div className="font-bold text-editorial-text-primary">Bs. {(selectedAuditClosing.bcvRateAtClose || exchangeRate || 1).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-editorial-text-muted uppercase tracking-wider mb-1">Apertura Gaveta ($)</div>
                  <div className="font-bold text-editorial-text-primary">${(selectedAuditClosing.initialCashUsd ?? selectedAuditClosing.initialDrawerUsd ?? selectedAuditClosing.startingCashUsd ?? selectedAuditClosing.startingCash ?? 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-editorial-text-muted uppercase tracking-wider mb-1">Apertura Gaveta (Bs)</div>
                  <div className="font-bold text-editorial-text-primary">Bs. {(selectedAuditClosing.initialCashBs ?? selectedAuditClosing.initialDrawerBs ?? selectedAuditClosing.startingCashBs ?? 0).toFixed(2)}</div>
                </div>
              </div>

              {/* Bloque de Conciliación */}
              <div>
                <h4 className="font-serif text-md font-bold text-editorial-text-primary border-b border-editorial-border pb-2 mb-3 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-editorial-text-muted" />
                  Conciliación de Efectivo en Gaveta
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-editorial-bg p-4 border border-editorial-border rounded relative">
                    <div className="absolute top-0 right-0 px-2 py-1 bg-neutral-800 text-[9px] font-mono font-bold uppercase rounded-bl text-editorial-text-muted">Divisas ($)</div>
                    <div className="space-y-1 text-xs font-mono mt-2">
                      <div className="flex justify-between"><span className="text-editorial-text-muted">Esperado (Sistema):</span> <span>${(selectedAuditClosing.expectedCashUsd ?? selectedAuditClosing.expectedUsd ?? selectedAuditClosing.totalCalculated ?? 0).toFixed(2)}</span></div>
                      <div className="flex justify-between font-bold"><span className="text-editorial-text-primary">Real (Declarado):</span> <span>${(selectedAuditClosing.countedCashUsd ?? selectedAuditClosing.countedRealUsd ?? selectedAuditClosing.actualCashUsd ?? selectedAuditClosing.actualCash ?? 0).toFixed(2)}</span></div>
                      <div className="flex justify-between pt-2 mt-2 border-t border-editorial-border/30">
                        <span className="text-editorial-text-muted">Diferencia:</span>
                        {(() => {
                          const diffU = selectedAuditClosing.differenceUsd ?? selectedAuditClosing.diffUsd ?? selectedAuditClosing.difference ?? 0;
                          return (
                            <span className={`font-bold ${diffU === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {diffU === 0 ? 'Balance Perfecto' : `${diffU > 0 ? 'Sobrante +' : 'Faltante '}${diffU.toFixed(2)}`}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="bg-editorial-bg p-4 border border-editorial-border rounded relative">
                    <div className="absolute top-0 right-0 px-2 py-1 bg-neutral-800 text-[9px] font-mono font-bold uppercase rounded-bl text-editorial-text-muted">Moneda Nac. (Bs)</div>
                    <div className="space-y-1 text-xs font-mono mt-2">
                      <div className="flex justify-between"><span className="text-editorial-text-muted">Esperado (Sistema):</span> <span>Bs. {(selectedAuditClosing.expectedCashBs ?? selectedAuditClosing.expectedBs ?? 0).toFixed(2)}</span></div>
                      <div className="flex justify-between font-bold"><span className="text-editorial-text-primary">Real (Declarado):</span> <span>Bs. {(selectedAuditClosing.countedCashBs ?? selectedAuditClosing.actualCashBs ?? 0).toFixed(2)}</span></div>
                      <div className="flex justify-between pt-2 mt-2 border-t border-editorial-border/30">
                        <span className="text-editorial-text-muted">Diferencia:</span>
                        {(() => {
                          const diffB = selectedAuditClosing.differenceBs ?? selectedAuditClosing.diffBs ?? 0;
                          return (
                            <span className={`font-bold ${diffB === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {diffB === 0 ? 'Balance Perfecto' : `${diffB > 0 ? 'Sobrante +' : 'Faltante '}${diffB.toFixed(2)}`}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ingresos por Otros Medios (Banco/Fiado) */}
              <div>
                <h4 className="font-serif text-md font-bold text-editorial-text-primary border-b border-editorial-border pb-2 mb-3">Resumen Consolidado (Banco y Fiado)</h4>
                <div className="grid grid-cols-4 gap-3 text-[10px] font-mono">
                  <div className="bg-editorial-bg p-3 border border-editorial-border rounded text-center">
                    <div className="text-editorial-text-muted mb-1">Pago Móvil</div>
                    <div className="font-bold text-editorial-text-primary text-sm">Bs. {((selectedAuditClosing.totalMobile || 0) * (selectedAuditClosing.bcvRateAtClose || exchangeRate || 1)).toFixed(2)}</div>
                    <div className="text-[9px] text-emerald-400 mt-0.5">~${(selectedAuditClosing.totalMobile || 0).toFixed(2)}</div>
                  </div>
                  <div className="bg-editorial-bg p-3 border border-editorial-border rounded text-center">
                    <div className="text-editorial-text-muted mb-1">Punto / Biopago</div>
                    <div className="font-bold text-editorial-text-primary text-sm">Bs. {(((selectedAuditClosing.totalCard || 0) + (selectedAuditClosing.totalBiopago || 0)) * (selectedAuditClosing.bcvRateAtClose || exchangeRate || 1)).toFixed(2)}</div>
                    <div className="text-[9px] text-emerald-400 mt-0.5">~${((selectedAuditClosing.totalCard || 0) + (selectedAuditClosing.totalBiopago || 0)).toFixed(2)}</div>
                  </div>
                  <div className="bg-editorial-bg p-3 border border-amber-500/30 rounded text-center">
                    <div className="text-amber-500/70 mb-1">Fiado (Crédito)</div>
                    <div className="font-bold text-amber-500 text-sm">${(selectedAuditClosing.totalCreditSales || 0).toFixed(2)}</div>
                    <div className="text-[9px] text-amber-500/50 mt-0.5">Pendiente</div>
                  </div>
                  <div className="bg-editorial-bg p-3 border border-editorial-border rounded text-center">
                    <div className="text-editorial-text-muted mb-1">Total Ventas (Turno)</div>
                    <div className="font-bold text-emerald-400 text-sm">${((selectedAuditClosing.salesCashUsd || 0) + ((selectedAuditClosing.salesCashBs || 0) / (selectedAuditClosing.bcvRateAtClose || exchangeRate || 1)) + (selectedAuditClosing.totalCard || 0) + (selectedAuditClosing.totalMobile || 0) + (selectedAuditClosing.totalBiopago || 0) + (selectedAuditClosing.totalCreditSales || 0)).toFixed(2)}</div>
                  </div>
                </div>
              </div>

              {selectedAuditClosing.purged ? (
                <div className="bg-neutral-800 border border-neutral-700 p-6 rounded text-center mt-6">
                  <Archive className="w-8 h-8 text-neutral-500 mx-auto mb-3" />
                  <p className="text-neutral-400 font-mono text-xs uppercase tracking-wider">Detalle de tickets compactado para optimización de disco.</p>
                  <p className="text-neutral-500 font-mono text-[10px] mt-2">Cascarón contable preservado</p>
                </div>
              ) : (
                <>
                  {/* Detalle de Ventas */}
                  <div>
                    <h4 className="font-serif text-md font-bold text-editorial-text-primary border-b border-editorial-border pb-2 mb-3">Detalle de Ventas del Día ({closingDetails.sales.length})</h4>
                    <div className="bg-editorial-bg border border-editorial-border rounded overflow-hidden">
                      <table className="w-full text-left text-[9px] font-mono">
                        <thead className="bg-editorial-card border-b border-editorial-border text-editorial-text-muted uppercase">
                          <tr>
                            <th className="py-2 px-3">Boleto / Fecha y Hora</th>
                            <th className="py-2 px-3">Cliente</th>
                            <th className="py-2 px-3">Artículos</th>
                            <th className="py-2 px-3">Método</th>
                            <th className="py-2 px-3">Monto Total</th>
                            <th className="py-2 px-3 text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-editorial-border/60">
                          {closingDetails.sales.length === 0 ? (
                            <tr><td colSpan={6} className="p-4 text-center text-editorial-text-muted">No se registraron ventas.</td></tr>
                          ) : (
                            closingDetails.sales.map((sale: any) => {
                              return (
                                <tr key={sale.id} className="hover:bg-editorial-bg/60 transition-colors">
                                  <td className="py-2 px-3">
                                    <div className="font-bold text-amber-500">{sale.invoiceNumber || sale.id.slice(-6)}</div>
                                    <div className="text-[8px] text-editorial-text-muted">{new Date(sale.timestamp?.seconds ? sale.timestamp.seconds * 1000 : sale.timestamp).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'})}</div>
                                  </td>
                                  <td className="py-2 px-3 truncate max-w-[100px]">{sale.entityName || sale.entity || 'Público'}</td>
                                  <td className="py-2 px-3">{sale.items?.length || 0} items</td>
                                  <td className="py-2 px-3">
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase ${sale.category === 'credito' || sale.paymentMethod === 'Mundo Kalu' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                      {sale.paymentMethod || 'Contado'}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 font-bold text-emerald-400">${(sale.amount || 0).toFixed(2)}</td>
                                  <td className="py-2 px-3 text-center">
                                    <button 
                                      onClick={() => setLastReceipt(sale)}
                                      className="px-2 py-1 bg-editorial-card border border-editorial-border text-editorial-text-primary rounded hover:bg-amber-500/20 hover:text-amber-500 hover:border-amber-500/50 transition-colors inline-flex items-center gap-1 font-bold"
                                    >
                                      <FileText className="w-3 h-3" />
                                      Ver boleto
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Abonos y Gastos */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-serif text-md font-bold text-editorial-text-primary border-b border-editorial-border pb-2 mb-3 text-emerald-400">Detalle de Abonos</h4>
                      <div className="bg-editorial-bg border border-editorial-border rounded overflow-hidden p-2 space-y-2 max-h-[200px] overflow-y-auto">
                        {closingDetails.incomes.length === 0 ? (
                          <div className="text-[10px] text-editorial-text-muted font-mono text-center py-2">No hubo abonos.</div>
                        ) : (
                          closingDetails.incomes.map((inc: any) => (
                            <div key={inc.id} className="flex justify-between items-center text-[10px] font-mono border-b border-editorial-border/30 pb-1">
                              <div>
                                <div className="text-editorial-text-primary">{inc.entity || inc.entityName || 'Cliente'}</div>
                                <div className="text-[8px] text-editorial-text-muted">{inc.paymentMethod}</div>
                              </div>
                              <div className="text-emerald-400 font-bold">+${inc.amount.toFixed(2)}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-serif text-md font-bold text-editorial-text-primary border-b border-editorial-border pb-2 mb-3 text-rose-400">Detalle de Gastos</h4>
                      <div className="bg-editorial-bg border border-editorial-border rounded overflow-hidden p-2 space-y-2 max-h-[200px] overflow-y-auto">
                        {closingDetails.expenses.length === 0 ? (
                          <div className="text-[10px] text-editorial-text-muted font-mono text-center py-2">No hubo gastos.</div>
                        ) : (
                          closingDetails.expenses.map((exp: any) => (
                            <div key={exp.id} className="flex justify-between items-center text-[10px] font-mono border-b border-editorial-border/30 pb-1">
                              <div>
                                <div className="text-editorial-text-primary">{exp.description || 'Gasto'}</div>
                                <div className="text-[8px] text-editorial-text-muted">{exp.paymentMethod}</div>
                              </div>
                              <div className="text-rose-400 font-bold">-${exp.amount.toFixed(2)}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}

            </div>
            <div className="p-4 bg-editorial-bg border-t border-editorial-border flex justify-end">
              <button
                onClick={() => setSelectedAuditClosing(null)}
                className="px-6 py-2 border border-editorial-border text-editorial-text-primary text-xs font-bold uppercase tracking-wider rounded hover:bg-editorial-card transition-colors"
              >
                Cerrar Auditoría
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Lock - Aprobación Mundo Kalu */}
      {isWaitingForApproval && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-editorial-card border border-amber-500/50 rounded-2xl w-full max-w-md flex flex-col shadow-2xl p-8 text-center animate-pulse">
            <Store className="w-16 h-16 text-amber-500 mx-auto mb-6 animate-bounce" />
            <h3 className="font-serif font-black text-amber-500 text-2xl uppercase tracking-widest mb-2">
              Esperando Aprobación
            </h3>
            <p className="text-editorial-text-primary text-sm font-mono mb-6">
              El cliente debe aceptar el crédito desde su celular para finalizar la compra.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  if (pendingApprovalId) {
                    deleteLocalDoc('transactions', pendingApprovalId).catch(console.error);
                  }
                  setIsWaitingForApproval(false);
                  setPendingApprovalId(null);
                  setIsProcessing(false);
                  setAddedPayments(prev => prev.filter(p => p.method !== 'Mundo Kalu'));
                }}
                className="w-full py-3 border border-rose-500/50 text-rose-500 font-serif font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-rose-500/10 transition-colors"
              >
                Cancelar Solicitud
              </button>
              
            </div>
          </div>
        </div>
      )}

      {unknownBarcode && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
          <div className="bg-editorial-bg border border-editorial-border rounded w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-editorial-border bg-amber-500/10 flex justify-between items-start">
              <div>
                <h3 className="text-xl font-serif font-black uppercase text-amber-500 tracking-wider flex items-center gap-2">
                  <Scan className="w-5 h-5" />
                  Código Desconocido
                </h3>
                <p className="text-xs text-editorial-text-muted mt-1 font-mono">{unknownBarcode}</p>
                <p className="text-[10px] uppercase text-editorial-text-muted mt-2 leading-tight">
                  Selecciona el producto del inventario para vincular este código de barra (Máx. 5).
                </p>
              </div>
            </div>
            
            <div className="p-4 bg-editorial-card">
              <input
                autoFocus
                type="text"
                placeholder="Buscar producto por nombre..."
                value={barcodeLinkSearch}
                onChange={(e) => setBarcodeLinkSearch(e.target.value)}
                className="w-full bg-editorial-bg border border-editorial-border rounded p-3 text-sm text-editorial-text-primary focus:border-amber-500 transition-colors outline-none"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {products
                .filter(p => barcodeLinkSearch.length > 1 && (p.name || '').toLowerCase().includes(barcodeLinkSearch.toLowerCase()))
                .map(p => {
                  const currentBarcodes = p.barcodes || [];
                  if (p.barcode && !currentBarcodes.includes(p.barcode)) currentBarcodes.push(p.barcode);
                  const isFull = currentBarcodes.length >= 5;
                  
                  return (
                    <div 
                      key={p.id}
                      onClick={async () => {
                        if (isFull || linkingBarcode) return;
                        setLinkingBarcode(true);
                        try {
                          const newBarcodes = [...new Set([...(p.barcodes || []), unknownBarcode])];
                          if (p.barcode && !newBarcodes.includes(p.barcode)) newBarcodes.push(p.barcode);
                          
                          await updateLocalDoc('products', p.id, {
                            barcodes: newBarcodes
                          });
                          
                          // After linking, add 1 to cart
                          handleAddToCart(p, 1);
                          onAddNotification(`Código vinculado a ${p.name}`, 'success');
                          
                          setUnknownBarcode(null);
                          setBarcodeLinkSearch('');
                          setSearchQuery('');
                          setTimeout(() => searchInputRef.current?.focus(), 100);
                        } catch(e) {
                          console.error(e);
                          onAddNotification('Error al vincular código', 'warning');
                        } finally {
                          setLinkingBarcode(false);
                        }
                      }}
                      className={`p-3 border border-editorial-border rounded flex justify-between items-center transition-colors ${isFull ? 'opacity-50' : 'cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5'}`}
                    >
                      <div>
                        <div className="font-bold text-editorial-text-primary text-sm">{p.name}</div>
                        <div className="text-[10px] text-editorial-text-muted uppercase">{p.category} • {currentBarcodes.length}/5 Códigos</div>
                      </div>
                      <div className="font-mono text-emerald-500 text-xs font-bold">${p.sellingPrice}</div>
                    </div>
                  );
                })}
              {barcodeLinkSearch.length <= 1 && (
                <div className="text-center text-editorial-text-muted text-xs p-4">Escribe al menos 2 letras para buscar.</div>
              )}
            </div>

            <div className="p-4 border-t border-editorial-border bg-editorial-card flex justify-end">
              <button 
                onClick={() => {
                  setUnknownBarcode(null);
                  setBarcodeLinkSearch('');
                  setSearchQuery('');
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                }}
                className="px-6 py-2 text-xs font-bold uppercase tracking-wider text-editorial-text-muted hover:text-editorial-text-primary transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pedidos Pendientes Modal */}
      {isPedidosModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-editorial-bg border border-editorial-border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-scale-in relative overflow-hidden">
            <div className="p-6 border-b border-editorial-border flex justify-between items-center bg-editorial-card">
              <h2 className="text-xl font-serif font-bold text-white flex items-center gap-3 tracking-tight">
                <Smartphone className="w-6 h-6 text-emerald-400" />
                Pedidos Pendientes
              </h2>
              <button 
                onClick={() => setIsPedidosModalOpen(false)}
                className="w-10 h-10 rounded hover:bg-editorial-border flex items-center justify-center transition-colors text-editorial-text-muted hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              {(() => {
                const pendingOrders = mobileOrders.filter(o => o.status === 'Pendiente');
                if (pendingOrders.length === 0) {
                  return (
                    <div className="text-center py-12 text-editorial-text-muted">
                      <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="font-mono text-sm uppercase">No hay pedidos pendientes en este momento.</p>
                    </div>
                  );
                }
                
                return pendingOrders.map(order => (
                  <div key={order.id} className="bg-editorial-card border border-editorial-border hover:border-emerald-500/30 p-4 rounded-xl flex items-center justify-between transition-colors">
                    <div>
                      <p className="text-sm font-bold text-white mb-1 uppercase tracking-wider">{order.entityName}</p>
                      <p className="text-xs text-editorial-text-muted font-mono">
                        {order.items.length} producto(s) • Total: <span className="text-emerald-400">${(order.total || 0).toLocaleString()} USD</span>
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        // Load mobile order into POS cart
                        const newCart: CheeseSaleItem[] = order.items.map((item) => ({
                          productId: item.productId,
                          name: item.name,
                          pricePerKg: item.price,
                          quantityKg: item.quantity,
                          subtotal: item.subtotal,
                          unit: item.unit
                        }));
                        setCart(newCart);
                        setCustomerType(order.type === 'supplier' ? 'supplier' : 'client');
                        if (order.type === 'supplier') {
                          setSelectedSupplierId(String(order.entityId));
                          const s = suppliers.find(su => String(su.id) === String(order.entityId));
                          setSupplierSearchText(s ? (s.name || '') : order.entityName);
                        } else {
                          setSelectedClientId(String(order.entityId));
                          const c = clients.find(cl => String(cl.id) === String(order.entityId));
                          setClientSearchText(c ? (c.name || '') : order.entityName);
                        }
                        
                        // Marcar orden como entregada en la base de datos
                        try {
                          await updateLocalDoc('mobileOrders', order.id, { status: 'Entregado' });
                        } catch (err) {
                          console.error("Error updating mobile order status", err);
                        }

                        setActiveTab('pos');
                        setIsPedidosModalOpen(false);
                        onAddNotification(`Pedido de ${order.entityName} cargado a caja. Listo para facturar.`, 'success');
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500 hover:text-black text-emerald-400 text-xs font-bold font-mono uppercase rounded transition-colors border border-emerald-500/20"
                    >
                      <Zap className="w-4 h-4" /> Cargar Venta
                    </button>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
