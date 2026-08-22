import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, doc, updateDoc, getDocs, query, where, onSnapshot, increment, limit, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { askGeminiWithImage, askGemini } from '../../services/gemini';
import { INITIAL_CHEESE_PRODUCTS } from '../../data';
import { Save, ArrowLeft, Search, Package, Trash2, Camera, Mic, Loader2, Snowflake, CheckSquare, Square, FileText, Receipt } from 'lucide-react';
import { CheeseProduct, CheeseTrip, CentralVaultBalance, Transaction } from '../../types';

interface InvoiceUploadViewProps {
  onBack: () => void;
  settlingTripId?: string;
  cheeseTrips?: CheeseTrip[];
  onSettleTrip?: (id: string, settlementData: Partial<CheeseTrip>) => Promise<void>;
  vaultBalance?: CentralVaultBalance;
  onAddTransaction?: (tx: Partial<Transaction>) => void;
}

interface InvoiceItem {
  id: string;
  productId: string; // 'NEW' si no existe
  name: string;
  quantity: number;
  unitType: 'unidad' | 'bulto';
  unitsPerBulto: number;
  costPrice: number;
  marginPercent: number;
  salePrice: number;
  subtotal: number;
}

export default function InvoiceUploadView({ 
  onBack,
  settlingTripId,
  cheeseTrips,
  onSettleTrip,
  vaultBalance,
  onAddTransaction
}: InvoiceUploadViewProps) {
  // Estado Principal de la Factura
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState<string>('');
  const [isCredit, setIsCredit] = useState(false);
  
  // Estado del Buscador/Agregador
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<CheeseProduct[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [unitType, setUnitType] = useState<'unidad' | 'bulto'>('unidad');
  const [unitsPerBulto, setUnitsPerBulto] = useState<number>(10);
  
  // Estado UI
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [dictationText, setDictationText] = useState('');

  // Trip Settlement States
  const settlingTrip = cheeseTrips?.find(t => t.id === settlingTripId);
  const [showVaultPopup, setShowVaultPopup] = useState(false);
  const [showForceClosePopup, setShowForceClosePopup] = useState(false);
  const [vaultUsd, setVaultUsd] = useState(0);
  const [vaultBs, setVaultBs] = useState(0);
  const [vaultBankBs, setVaultBankBs] = useState(0);
  const [vaultBankUsd, setVaultBankUsd] = useState(0);
  const [bcvRate] = useState(45.00); // Or pass exchangeRate as prop

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Inicializar Proveedores y Escuchar en Tiempo Real
  useEffect(() => {
    const q = query(collection(db, 'suppliers'), limit(1000));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sups = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setSuppliers(sups);
      setSupplierId(prev => (sups.length > 0 && !prev) ? sups[0].id : prev);
    });

    return () => unsubscribe();
  }, []);

  // Inicializar Web Speech API para dictado
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'es-MX';

        recognitionRef.current.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          setDictationText(text);
          processDictationWithAI(text);
        };

        recognitionRef.current.onerror = () => setIsDictating(false);
        recognitionRef.current.onend = () => setIsDictating(false);
      }
    }
  }, []);

  // Buscador en tiempo real
  useEffect(() => {
    const searchProduct = async () => {
      if (searchTerm.length < 2) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const q = query(collection(db, 'inventory'), where('name', '>=', searchTerm), where('name', '<=', searchTerm + '\uf8ff'));
        const querySnapshot = await getDocs(q);
        const results = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CheeseProduct));
        
        if (results.length === 0) {
          // Fallback a local
          const localMatches = INITIAL_CHEESE_PRODUCTS.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
          setSearchResults(localMatches);
        } else {
          setSearchResults(results);
        }
      } catch (error) {
        const localMatches = INITIAL_CHEESE_PRODUCTS.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
        setSearchResults(localMatches);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(searchProduct, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const toggleDictation = () => {
    if (isDictating) {
      recognitionRef.current?.stop();
    } else {
      setDictationText('');
      recognitionRef.current?.start();
      setIsDictating(true);
    }
  };

  const processDictationWithAI = async (text: string) => {
    setIsScanning(true);
    try {
      const prompt = `Analiza este texto dictado: "${text}". Extrae los productos comprados.
      Devuelve un JSON con este formato estricto:
      {
        "items": [
          { "name": "Nombre producto", "quantity": numero, "costPrice": numero }
        ]
      }`;
      const response = await askGemini(prompt, "Eres un sistema de extracción de datos para Kalu.");
      const jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      
      if (parsed.items && Array.isArray(parsed.items)) {
        const newItems = parsed.items.map((i: any) => createInvoiceItem('NEW', i.name, i.quantity, i.costPrice || 0));
        setItems(prev => [...prev, ...newItems]);
      }
    } catch (e) {
      console.error("Error al procesar dictado:", e);
      alert("No se pudo extraer la información del dictado.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleImageScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    try {
      // Convertir a base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        
        const prompt = `Extrae los artículos de esta factura/ticket. Devuelve un JSON estrictamente con este formato:
        {
          "items": [
            { "name": "Nombre", "quantity": numero, "costPrice": numero }
          ]
        }`;
        
        const response = await askGeminiWithImage(prompt, base64String, file.type);
        const jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        
        if (parsed.items && Array.isArray(parsed.items)) {
          const newItems = parsed.items.map((i: any) => createInvoiceItem('NEW', i.name, i.quantity, i.costPrice || 0));
          setItems(prev => [...prev, ...newItems]);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error OCR:", error);
      alert("Fallo al escanear la imagen.");
      setIsScanning(false);
    }
  };

  const createInvoiceItem = (productId: string, name: string, qty: number, cost: number): InvoiceItem => {
    const finalQty = unitType === 'bulto' ? qty * unitsPerBulto : qty;
    const defaultMargin = 30; // 30% por defecto
    const sale = cost * (1 + (defaultMargin / 100));
    
    return {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,
      productId,
      name,
      quantity: finalQty,
      unitType,
      unitsPerBulto,
      costPrice: cost,
      marginPercent: defaultMargin,
      salePrice: parseFloat(sale.toFixed(2)),
      subtotal: cost * finalQty
    };
  };

  const handleAddProduct = (prod: CheeseProduct | { id: string, name: string }) => {
    // Tomar costo existente si lo hay, o 0
    const cost = (prod as CheeseProduct).purchasePrice || 0;
    const newItem = createInvoiceItem(prod.id, prod.name, 1, cost);
    setItems([...items, newItem]);
    setSearchTerm('');
    setSearchResults([]);
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      let updated = { ...item, [field]: value };
      
      // Lógica de cálculo en cadena
      if (field === 'costPrice' || field === 'marginPercent') {
        updated.salePrice = parseFloat((updated.costPrice * (1 + (updated.marginPercent / 100))).toFixed(2));
        updated.subtotal = updated.costPrice * updated.quantity;
      } else if (field === 'salePrice') {
        updated.marginPercent = updated.costPrice > 0 
          ? parseFloat((((updated.salePrice - updated.costPrice) / updated.costPrice) * 100).toFixed(1))
          : 100;
      } else if (field === 'quantity') {
        updated.subtotal = updated.costPrice * updated.quantity;
      }
      
      return updated;
    }));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleFreezeDraft = async () => {
    if (items.length === 0) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'daily_drafts'), {
        type: 'invoice_draft',
        items,
        supplierId,
        isCredit,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      });
      alert("Borrador Congelado guardado con éxito.");
      setItems([]);
    } catch (e) {
      console.error(e);
      alert("Error al congelar borrador.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalSave = async () => {
    if (items.length === 0) return;
    setIsSaving(true);
    try {
      const totalInvoiceCost = items.reduce((sum, item) => sum + item.subtotal, 0);

      // 1. Guardar factura en compras
      await addDoc(collection(db, 'purchases'), {
        supplierId,
        isCredit,
        items,
        totalCost: totalInvoiceCost,
        date: new Date().toISOString(),
        status: 'Completado'
      });

      // 2. Actualizar Inventario Atómicamente (por cada item)
      for (const item of items) {
        let prevStock = 0;

        if (item.productId && item.productId !== 'NEW') {
          try {
            const productRef = doc(db, 'products', item.productId);
            // Fetch previous stock before updating
            const productSnap = await getDoc(productRef);
            if (productSnap.exists()) {
              prevStock = productSnap.data().stockKg || 0;
            }

            await updateDoc(productRef, {
               purchasePrice: item.costPrice,
               sellingPrice: item.salePrice,
               stockKg: increment(item.quantity)
            });
          } catch (e) {
            console.warn("Item no hallado, se creará.");
            await addDoc(collection(db, 'products'), {
              name: item.name,
              stockKg: item.quantity,
              purchasePrice: item.costPrice,
              sellingPrice: item.salePrice,
              category: 'General'
            });
          }
        } else {
          // Crear nuevo producto en inventario
          await addDoc(collection(db, 'products'), {
            name: item.name,
            stockKg: item.quantity,
            purchasePrice: item.costPrice,
            sellingPrice: item.salePrice,
            category: 'General'
          });
        }

        // Add Kardex Movement
        try {
          await addDoc(collection(db, 'kardex'), {
            productId: item.productId || 'NEW',
            productName: item.name,
            type: 'ENTRADA',
            concept: settlingTrip ? 'Liquidación Gira San Juan / Compra Víveres' : 'Compra Víveres',
            quantity: item.quantity,
            previousStock: prevStock,
            newStock: prevStock + item.quantity,
            costPrice: item.costPrice,
            totalCost: item.costPrice * item.quantity,
            unit: item.unit || 'Kg/Und',
            price: item.costPrice, // Mantener para compatibilidad
            documentRef: settlingTrip ? `Viaje #${settlingTrip.tripNumber}` : (suppliers.find(s => s.id === supplierId)?.name || 'Compra'),
            date: new Date().toISOString()
          });
        } catch (e) {
          console.error("Error al registrar en kardex:", e);
        }
      }

      // 3. Persistencia de Cuentas por Pagar (CXP) si es Crédito
      if (isCredit && supplierId) {
        try {
          const supRef = doc(db, 'suppliers', supplierId);
          await updateDoc(supRef, {
            balanceOwed: increment(Number(totalInvoiceCost))
          });
        } catch (e) {
          console.error("Error al actualizar deuda del proveedor:", e);
        }
      }

      // 4. Integración con Viaje San Juan (Si aplica)
      if (settlingTrip && onSettleTrip) {
        try {
          const currentInvoicesUsd = settlingTrip.totalInvoicesValueUsd || 0;
          const newInvoicesUsd = currentInvoicesUsd + totalInvoiceCost;
          
          const moneyUsd = (settlingTrip.cashReturnedUsd || 0) + (settlingTrip.bankReturnedUsd || 0);
          const moneyBsToUsd = ((settlingTrip.cashReturnedBs || 0) + (settlingTrip.bankReturnedBs || 0)) / bcvRate;
          const totalMoneyUsd = moneyUsd + moneyBsToUsd;

          const totalSettlementValue = totalMoneyUsd + newInvoicesUsd;
          const tripBagValue = settlingTrip.totalBagValueUsd || settlingTrip.dispatchedCostValue;
          const netProfit = totalSettlementValue - tripBagValue;

          // Construir facturas para el registro del viaje
          const invoicesList = settlingTrip.invoices || [];
          invoicesList.push({
            id: `INV-${Date.now()}`,
            supplierName: suppliers.find(s => s.id === supplierId)?.name || 'Compras Locales',
            date: new Date().toISOString(),
            totalUsd: totalInvoiceCost,
            items: items.map(item => ({ description: item.name, quantity: item.quantity, unitCostUsd: item.costPrice, totalCostUsd: item.subtotal }))
          });

          const updateData: any = {
            invoices: invoicesList,
            totalInvoicesValueUsd: newInvoicesUsd,
            totalSettlementValueUsd: totalSettlementValue,
            netProfitUsd: netProfit
          };

          // Auto-Liquidación si cubre la deuda
          if (totalSettlementValue >= tripBagValue) {
            updateData.status = 'liquidado';
            updateData.settledAt = new Date().toISOString();
            await onSettleTrip(settlingTrip.id, updateData);
          } else {
            // Actualización parcial
            await updateDoc(doc(db, 'cheeseTrips', settlingTrip.id), updateData);
          }
        } catch (e) {
          console.error("Error al amortizar viaje:", e);
        }
      }

      alert("Factura ingresada e inventario actualizado.");
      setItems([]);
      setSearchTerm('');
    } catch (error) {
      console.error("Error al procesar compra:", error);
      alert("Ocurrió un error al guardar.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveVault = async () => {
    if (!settlingTrip) return;
    setIsSaving(true);
    try {
      // 1. Fondear la Bóveda Central (Si hay onAddTransaction prop)
      if (onAddTransaction) {
        if (vaultUsd > 0) onAddTransaction({ category: 'ventas', amount: vaultUsd, isIncome: true, notes: `Retorno Viaje #${settlingTrip.tripNumber} (Efectivo USD)`, paymentMethod: 'Efectivo' });
        if (vaultBs > 0) onAddTransaction({ category: 'ventas', amount: vaultBs / bcvRate, isIncome: true, notes: `Retorno Viaje #${settlingTrip.tripNumber} (Efectivo Bs: ${vaultBs})`, paymentMethod: 'Efectivo' });
        if (vaultBankBs > 0) onAddTransaction({ category: 'ventas', amount: vaultBankBs / bcvRate, isIncome: true, notes: `Retorno Viaje #${settlingTrip.tripNumber} (Banco Bs: ${vaultBankBs})`, paymentMethod: 'Transferencia' });
        if (vaultBankUsd > 0) onAddTransaction({ category: 'ventas', amount: vaultBankUsd, isIncome: true, notes: `Retorno Viaje #${settlingTrip.tripNumber} (Banco USD)`, paymentMethod: 'Transferencia' });
      }

      // 2. Amortizar en el viaje
      const newCashUsd = (settlingTrip.cashReturnedUsd || 0) + vaultUsd;
      const newCashBs = (settlingTrip.cashReturnedBs || 0) + vaultBs;
      const newBankBs = (settlingTrip.bankReturnedBs || 0) + vaultBankBs;
      const newBankUsd = (settlingTrip.bankReturnedUsd || 0) + vaultBankUsd;

      const currentInvoicesUsd = settlingTrip.totalInvoicesValueUsd || 0;
      
      const moneyUsd = newCashUsd + newBankUsd;
      const moneyBsToUsd = (newCashBs + newBankBs) / bcvRate;
      const totalMoneyUsd = moneyUsd + moneyBsToUsd;

      const totalSettlementValue = totalMoneyUsd + currentInvoicesUsd;
      const tripBagValue = settlingTrip.totalBagValueUsd || settlingTrip.dispatchedCostValue;
      const netProfit = totalSettlementValue - tripBagValue;

      const updateData: any = {
        cashReturnedUsd: newCashUsd,
        cashReturnedBs: newCashBs,
        bankReturnedBs: newBankBs,
        bankReturnedUsd: newBankUsd,
        totalSettlementValueUsd: totalSettlementValue,
        netProfitUsd: netProfit
      };

      if (totalSettlementValue >= tripBagValue) {
        updateData.status = 'liquidado';
        updateData.settledAt = new Date().toISOString();
        if (onSettleTrip) {
          await onSettleTrip(settlingTrip.id, updateData);
        }
      } else {
        await updateDoc(doc(db, 'cheeseTrips', settlingTrip.id), updateData);
      }

      alert("Dinero ingresado a Bóveda y amortizado al viaje.");
      setShowVaultPopup(false);
      setVaultUsd(0); setVaultBs(0); setVaultBankBs(0); setVaultBankUsd(0);
    } catch (e) {
      console.error(e);
      alert("Error al guardar dinero en bóveda.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleForceClose = async () => {
    if (!settlingTrip || !onSettleTrip) return;
    setIsSaving(true);
    try {
      await onSettleTrip(settlingTrip.id, {
        status: 'liquidado',
        settledAt: new Date().toISOString()
      });
      alert('Viaje cerrado con pérdida o saldo pendiente.');
      setShowForceClosePopup(false);
    } catch (e) {
      console.error(e);
      alert('Error al forzar el cierre del viaje.');
    } finally {
      setIsSaving(false);
    }
  };

  const grandTotal = items.reduce((sum, i) => sum + i.subtotal, 0);

  return (
    <div className="flex flex-col h-full bg-zinc-950 animate-fade-in font-sans">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border-b border-zinc-800 gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-serif font-bold text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-rose-500" />
              Carga Inteligente de Facturas
            </h1>
            <p className="text-xs font-mono text-zinc-500 mt-0.5 uppercase tracking-wider">Multi-Artículo • Inventario Automático</p>
          </div>
        </div>
        
        {/* Banner de Viaje Activo */}
        {settlingTrip && (
          <div className="bg-amber-500/10 border border-amber-500/30 px-4 py-2 rounded-lg flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] font-mono uppercase text-amber-500/80">Liquidando Viaje San Juan</div>
              <div className="text-sm font-bold text-amber-500">
                Deuda: ${Math.max(0, (settlingTrip.totalBagValueUsd || settlingTrip.dispatchedCostValue) - (settlingTrip.totalSettlementValueUsd || 0)).toFixed(2)}
              </div>
            </div>
            {((settlingTrip.netProfitUsd || 0) > 0) && (
              <div className="text-right border-l border-amber-500/20 pl-4">
                <div className="text-[10px] font-mono uppercase text-emerald-500/80">Saldo a Favor Daisy</div>
                <div className="text-sm font-bold text-emerald-500">
                  +${(settlingTrip.netProfitUsd || 0).toFixed(2)}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {settlingTrip && (
            <>
              <button 
                onClick={() => setShowVaultPopup(true)}
                disabled={isSaving}
                className="bg-zinc-900 border border-zinc-700 hover:border-amber-500 hover:text-amber-400 text-zinc-300 px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors disabled:opacity-50"
              >
                Ingresar Dinero a Bóveda
              </button>
              {Math.max(0, (settlingTrip.totalBagValueUsd || settlingTrip.dispatchedCostValue) - (settlingTrip.totalSettlementValueUsd || 0)) > 0 && (
                <button 
                  onClick={() => setShowForceClosePopup(true)}
                  disabled={isSaving}
                  className="bg-rose-900/50 border border-rose-800 hover:bg-rose-800 text-rose-300 px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors disabled:opacity-50"
                >
                  Forzar Cierre
                </button>
              )}
            </>
          )}
          <button 
            onClick={handleFreezeDraft}
            disabled={isSaving}
            className="bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-zinc-300 px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Snowflake className="w-4 h-4 text-cyan-400" />
            Congelar Borrador
          </button>
          
          <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handleImageScan} />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning || isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded text-xs font-bold transition-colors cursor-pointer shadow-md disabled:opacity-50"
          >
            {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            <span className="hidden sm:inline">Escanear IA</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        
        {/* Panel Central (Buscador y Tabla) */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-zinc-800">
          
          {/* Action Bar (Búsqueda + Dictado + Toggle Bulto) */}
          <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 shrink-0 space-y-4">
            
            {/* Dictado Rápido */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input 
                  type="text" 
                  value={dictationText}
                  onChange={(e) => setDictationText(e.target.value)}
                  placeholder="Dictar: 'Cargar 10 kilos de queso a 50 pesos...'"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg py-2.5 pl-4 pr-12 text-sm text-zinc-100 focus:outline-none focus:border-brand-accent transition-colors"
                />
                <button 
                  onClick={toggleDictation}
                  className={`absolute right-1 top-1 bottom-1 px-3 rounded flex items-center justify-center transition-colors ${isDictating ? 'bg-rose-500 text-white animate-pulse' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'}`}
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>
              <button 
                onClick={() => processDictationWithAI(dictationText)}
                disabled={!dictationText || isScanning}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg text-xs font-bold uppercase transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                Analizar IA
              </button>
            </div>

            {/* Buscador Manual */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar producto existente o tipear nuevo nombre..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-2 pl-9 pr-4 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
                />
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-20 max-h-48 overflow-y-auto">
                    {searchResults.map(res => (
                      <button
                        key={res.id}
                        onClick={() => handleAddProduct(res)}
                        className="w-full text-left px-4 py-2 hover:bg-zinc-800 text-sm text-zinc-200 border-b border-zinc-800/50 last:border-0 flex justify-between items-center"
                      >
                        <span>{res.name}</span>
                        <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">Stock: {res.stockKg}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => handleAddProduct({ id: 'NEW', name: searchTerm })}
                      className="w-full text-left px-4 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-sm font-bold text-emerald-400 border-t border-emerald-500/20"
                    >
                      + Agregar "{searchTerm}" como nuevo producto
                    </button>
                  </div>
                )}
              </div>

              {/* Toggle de Medida */}
              <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg p-1 w-full sm:w-auto">
                <button
                  onClick={() => setUnitType('unidad')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded ${unitType === 'unidad' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Unidad
                </button>
                <button
                  onClick={() => setUnitType('bulto')}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold rounded flex items-center gap-1 ${unitType === 'bulto' ? 'bg-brand-accent text-zinc-950' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  <Package className="w-3 h-3" /> Bulto
                </button>
              </div>
              
              {unitType === 'bulto' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Pzs/Bulto:</span>
                  <input 
                    type="number" 
                    value={unitsPerBulto} 
                    onChange={e => setUnitsPerBulto(Number(e.target.value))}
                    className="w-16 bg-zinc-950 border border-zinc-700 rounded py-1 px-2 text-sm text-center text-zinc-100"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Tabla Dinámica (Scrollable) */}
          <div className="flex-1 overflow-auto bg-zinc-950 p-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4">
                <FileText className="w-12 h-12 opacity-20" />
                <p className="text-sm">La factura está vacía. Busca productos o escanea un ticket.</p>
              </div>
            ) : (
              <div className="min-w-[800px]">
                {/* Cabecera de Tabla */}
                <div className="grid grid-cols-12 gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500 border-b border-zinc-800 pb-2 mb-2 px-2">
                  <div className="col-span-4">Producto</div>
                  <div className="col-span-2 text-center">Cant. Final</div>
                  <div className="col-span-2 text-right">Costo Unit.</div>
                  <div className="col-span-1 text-center">% Gan.</div>
                  <div className="col-span-2 text-right">Precio Venta</div>
                  <div className="col-span-1"></div>
                </div>

                {/* Filas */}
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg p-2 transition-colors">
                      <div className="col-span-4 flex items-center">
                        <input 
                          type="text" 
                          value={item.name} 
                          onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                          className="w-full bg-transparent text-sm font-semibold text-zinc-100 focus:outline-none focus:bg-zinc-950 focus:ring-1 ring-zinc-700 rounded px-2 py-1"
                        />
                      </div>
                      <div className="col-span-2 flex justify-center">
                        <input 
                          type="number" 
                          value={item.quantity} 
                          onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value))}
                          className="w-20 bg-zinc-950 border border-zinc-700 text-center text-sm font-mono text-zinc-100 rounded px-2 py-1 focus:outline-none focus:border-brand-accent"
                        />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <input 
                          type="number" 
                          value={item.costPrice} 
                          onChange={(e) => updateItem(item.id, 'costPrice', Number(e.target.value))}
                          className="w-24 bg-zinc-950 border border-zinc-700 text-right text-sm font-mono text-rose-400 rounded px-2 py-1 focus:outline-none focus:border-rose-500"
                        />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <input 
                          type="number" 
                          value={item.marginPercent} 
                          onChange={(e) => updateItem(item.id, 'marginPercent', Number(e.target.value))}
                          className="w-14 bg-zinc-950 border border-zinc-700 text-center text-sm font-mono text-emerald-400 rounded px-1 py-1 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <input 
                          type="number" 
                          value={item.salePrice} 
                          onChange={(e) => updateItem(item.id, 'salePrice', Number(e.target.value))}
                          className="w-24 bg-zinc-950 border border-zinc-700 text-right text-sm font-mono text-emerald-400 rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="col-span-1 flex justify-end pr-2">
                        <button onClick={() => removeItem(item.id)} className="p-1.5 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Panel Lateral/Inferior de Resumen */}
        <div className="w-full lg:w-80 bg-zinc-900 border-t lg:border-t-0 lg:border-l border-zinc-800 flex flex-col shrink-0">
          <div className="p-4 sm:p-6 flex-1 flex flex-col gap-6">
            
            <div>
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 mb-3">Detalle de Compra</h3>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-300">Proveedor</label>
                  <select 
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-100 focus:outline-none focus:border-brand-accent"
                  >
                    <option value="">Seleccione Proveedor Comercial...</option>
                    {suppliers.filter(s => !s.isCheeseProducer).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div 
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${isCredit ? 'bg-amber-500/10 border-amber-500/30' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}`}
                  onClick={() => setIsCredit(!isCredit)}
                >
                  <div className="flex items-center gap-2">
                    {isCredit ? <CheckSquare className="w-4 h-4 text-amber-500" /> : <Square className="w-4 h-4 text-zinc-600" />}
                    <span className="text-sm font-semibold text-zinc-200">¿Compra a Crédito?</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">Cta. por Pagar</span>
                </div>
              </div>
            </div>

            <div className="mt-auto bg-zinc-950 border border-zinc-800 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-zinc-400">Total de Artículos:</span>
                <span className="text-sm font-mono font-bold text-zinc-200">{items.length}</span>
              </div>
              <div className="flex justify-between items-end border-t border-zinc-800 pt-3 mt-2">
                <span className="text-sm text-zinc-300 font-bold">Inversión Total:</span>
                <span className="text-2xl font-mono font-black text-rose-400">${grandTotal.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
            </div>

            <button
              onClick={handleFinalSave}
              disabled={items.length === 0 || isSaving}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black uppercase tracking-widest text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Guardar e Incrementar
            </button>
          </div>
        </div>

      </div>

      {showVaultPopup && settlingTrip && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-2xl shadow-2xl w-full max-w-sm">
            <h2 className="text-lg font-serif font-bold text-white mb-1">Ingresar Dinero a Bóveda</h2>
            <p className="text-xs text-zinc-500 mb-6 font-mono">Amortizar viaje #{settlingTrip.tripNumber}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-500 mb-1">Efectivo ($ USD)</label>
                <input type="number" step="0.01" value={vaultUsd || ''} onChange={e => setVaultUsd(Number(e.target.value))} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-500 mb-1">Efectivo (Bs.)</label>
                <input type="number" step="0.01" value={vaultBs || ''} onChange={e => setVaultBs(Number(e.target.value))} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-500 mb-1">Banco PM (Bs.)</label>
                  <input type="number" step="0.01" value={vaultBankBs || ''} onChange={e => setVaultBankBs(Number(e.target.value))} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-500 mb-1">Banco ($ USD)</label>
                  <input type="number" step="0.01" value={vaultBankUsd || ''} onChange={e => setVaultBankUsd(Number(e.target.value))} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setShowVaultPopup(false)} disabled={isSaving} className="flex-1 py-3 text-xs font-bold uppercase text-zinc-500 hover:text-white transition-colors disabled:opacity-50">Cancelar</button>
              <button onClick={handleSaveVault} disabled={isSaving} className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg text-xs font-bold uppercase transition-colors shadow-lg shadow-amber-500/20 disabled:opacity-50">
                {isSaving ? 'Guardando...' : 'Fondeo y Amortizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForceClosePopup && settlingTrip && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-rose-900 p-6 rounded-2xl shadow-2xl shadow-rose-900/20 w-full max-w-md">
            <h2 className="text-xl font-serif font-black text-rose-500 mb-2">Advertencia Crítica</h2>
            <p className="text-sm text-zinc-300 mb-6 font-mono leading-relaxed">
              El viaje aún presenta una <span className="font-bold text-rose-400">deuda pendiente de ${Math.max(0, settlingTrip.dispatchedCostValue - (settlingTrip.totalSettlementValueUsd || 0)).toFixed(2)}</span>. 
              <br/><br/>
              ¿Desea registrarlo con pérdida/saldo pendiente y liquidarlo a la fuerza, o prefiere continuar amortizando?
            </p>

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => setShowForceClosePopup(false)} 
                disabled={isSaving}
                className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold uppercase transition-colors disabled:opacity-50"
              >
                Continuar Amortizando
              </button>
              <button 
                onClick={handleForceClose} 
                disabled={isSaving} 
                className="w-full py-3 bg-rose-900 hover:bg-rose-800 text-rose-200 rounded-lg text-xs font-bold uppercase transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSaving ? 'Procesando...' : 'Cerrar con Pérdida (Forzar)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
