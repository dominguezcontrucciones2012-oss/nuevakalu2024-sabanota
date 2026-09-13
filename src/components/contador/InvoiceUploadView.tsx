import { fetchCollection, onCollectionSnapshot, addLocalDoc, updateLocalDoc, deleteLocalDoc } from '../../services/localApi';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { extractInvoiceData, extractDictationData, pingGeminiAPI, normalizeTextForMatching } from '../../services/ocrService';
import { INITIAL_CHEESE_PRODUCTS } from '../../data';
import { Save, ArrowLeft, Search, Package, Trash2, Camera, Image as ImageIcon, Mic, Loader2, Snowflake, Flame, CheckSquare, Square, FileText, Receipt, AlertCircle, Sparkles, CheckCircle2, Wifi, WifiOff, X, RefreshCw, FolderOpen } from 'lucide-react';
import { CheeseProduct, CheeseTrip, CentralVaultBalance, Transaction, SupplierProfile } from '../../types';

interface InvoiceUploadViewProps {
  onBack: () => void;
  settlingTripId?: string;
  cheeseTrips?: CheeseTrip[];
  onSettleTrip?: (id: string, settlementData: Partial<CheeseTrip>) => Promise<void>;
  vaultBalance?: CentralVaultBalance;
  onAddTransaction?: (tx: Partial<Transaction>) => void;
  products?: CheeseProduct[];
  suppliers?: SupplierProfile[];
  exchangeRate?: number;
}

interface InvoiceItem {
  id: string;
  productId: string; // ID real o 'NEW' si no existe
  name: string;
  quantity: number;
  unitType: 'unidad' | 'bulto';
  unitsPerBulto: number;
  costPrice: number;
  marginPercent: number;
  salePrice: number;
  subtotal: number;
  unit?: 'Kg' | 'Und' | 'Bulto';
}

interface InvoiceDraft {
  id: string;
  type: string;
  items: InvoiceItem[];
  supplierId?: string;
  isCredit?: boolean;
  date?: string;
  createdAt: string;
}

export default function InvoiceUploadView({ 
  onBack,
  settlingTripId,
  cheeseTrips,
  onSettleTrip,
  vaultBalance,
  onAddTransaction,
  products: initialProducts = [],
  suppliers: initialSuppliers = [],
  exchangeRate: initialExchangeRate = 45.00
}: InvoiceUploadViewProps) {
  // Estado Principal de la Factura
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>(initialSuppliers);
  const [supplierId, setSupplierId] = useState<string>('');
  const [isCredit, setIsCredit] = useState(false);
  const [detectedInvoiceInfo, setDetectedInvoiceInfo] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'upload' | 'manual' | 'scanner'>('upload');
  
  // Estado de carga y procesamiento
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [apiHealthStatus, setApiHealthStatus] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');
  const [apiHealthMessage, setApiHealthMessage] = useState<string>('');

  // Voice Dictation & Drafts
  const [isDictating, setIsDictating] = useState(false);
  const [dictationText, setDictationText] = useState('');
  const [frozenDrafts, setFrozenDrafts] = useState<InvoiceDraft[]>([]);
  const [showDraftsModal, setShowDraftsModal] = useState(false);

  // Manual Entry States
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [unitType, setUnitType] = useState<'unidad' | 'bulto'>('unidad');
  const [unitsPerBulto, setUnitsPerBulto] = useState<number>(10);
  const [manualName, setManualName] = useState('');
  const [manualCost, setManualCost] = useState<number>(0);
  const [manualSale, setManualSale] = useState<number>(0);
  const [manualQty, setManualQty] = useState<number>(1);
  const [bcvRate, setBcvRate] = useState<number>(initialExchangeRate);

  // Trip Settlement States
  const settlingTrip = cheeseTrips?.find(t => t.id === settlingTripId);
  const [showVaultPopup, setShowVaultPopup] = useState(false);
  const [showForceClosePopup, setShowForceClosePopup] = useState(false);
  const [vaultUsd, setVaultUsd] = useState(0);
  const [vaultBs, setVaultBs] = useState(0);
  const [vaultBankBs, setVaultBankBs] = useState(0);
  const [vaultBankUsd, setVaultBankUsd] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Helper de Emparejamiento Preventivo
  const matchProductInCatalog = (nameToMatch: string, catalog: any[]): any | undefined => {
    if (!nameToMatch) return undefined;
    const cleanTarget = normalizeTextForMatching(nameToMatch);
    if (!cleanTarget) return undefined;

    // 1. Exacto normalizado
    let match = catalog.find(p => normalizeTextForMatching(p.name) === cleanTarget);
    if (match) return match;

    // 2. Contención de subcadena
    match = catalog.find(p => {
      const cleanP = normalizeTextForMatching(p.name);
      return cleanP.length >= 3 && (cleanP.includes(cleanTarget) || cleanTarget.includes(cleanP));
    });
    return match;
  };

  // Test API connection on mount
  useEffect(() => {
    let isMounted = true;
    const testApi = async () => {
      setApiHealthStatus('checking');
      const res = await pingGeminiAPI();
      if (!isMounted) return;
      if (res.ok) {
        setApiHealthStatus('online');
        setApiHealthMessage(res.message);
      } else {
        setApiHealthStatus('offline');
        setApiHealthMessage(res.message);
      }
    };
    testApi();
    return () => { isMounted = false; };
  }, []);

  // Sync suppliers from database or props
  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const data = await fetchCollection('suppliers');
        if (data && data.length > 0) {
          setSuppliers(data);
        }
      } catch (e) {
        console.error("Error cargando proveedores:", e);
      }
    };
    loadSuppliers();

    // Listen to real-time updates of frozen drafts
    const unsubDrafts = onCollectionSnapshot('daily_drafts', (data) => {
      const drafts = (data || []).filter((d: any) => d.type === 'invoice_draft');
      setFrozenDrafts(drafts);
    });

    return () => {
      if (unsubDrafts) unsubDrafts();
    };
  }, []);

  // Speech Recognition Setup
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('Reconocimiento de voz no soportado en este navegador');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'es-ES';

    recognition.onresult = (event: any) => {
      let current = '';
      for (let i = 0; i < event.results.length; i++) {
        current += event.results[i][0].transcript;
      }
      setDictationText(current);
    };

    recognition.onerror = (event: any) => {
      console.error('Error dictado:', event.error);
      setIsDictating(false);
    };

    recognition.onend = () => {
      setIsDictating(false);
      if (dictationText.trim()) {
        processDictationWithAI(dictationText);
      }
    };

    recognitionRef.current = recognition;
  }, [dictationText, bcvRate]);

  // Handle Search Debounced
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const searchProduct = async () => {
      setIsSearching(true);
      try {
        const productsList = await fetchCollection('products');
        const results = (productsList || []).filter((p: any) => normalizeTextForMatching(p.name).includes(normalizeTextForMatching(searchTerm)));
        
        if (results.length === 0) {
          const fallbackList = initialProducts.length > 0 ? initialProducts : INITIAL_CHEESE_PRODUCTS;
          const localMatches = fallbackList.filter(p => normalizeTextForMatching(p.name).includes(normalizeTextForMatching(searchTerm)));
          setSearchResults(localMatches);
        } else {
          setSearchResults(results);
        }
      } catch (error) {
        const fallbackList = initialProducts.length > 0 ? initialProducts : INITIAL_CHEESE_PRODUCTS;
        const localMatches = fallbackList.filter(p => normalizeTextForMatching(p.name).includes(normalizeTextForMatching(searchTerm)));
        setSearchResults(localMatches);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchProduct, 300);
    return () => clearTimeout(debounce);
  }, [searchTerm, initialProducts]);

  const toggleDictation = () => {
    if (isDictating) {
      recognitionRef.current?.stop();
      setIsDictating(false);
    } else {
      setDictationText('');
      try {
        recognitionRef.current?.start();
        setIsDictating(true);
      } catch (err) {
        console.error('Error iniciando dictado:', err);
      }
    }
  };

  // Alias para retrocompatibilidad
  const savedDrafts = frozenDrafts;

  const processDictationWithAI = async (text: string) => {
    setIsScanning(true);
    try {
      let allProducts: any[] = [];
      try {
        const prods = await fetchCollection('products');
        allProducts = Array.isArray(prods) ? prods : (initialProducts.length > 0 ? initialProducts : INITIAL_CHEESE_PRODUCTS);
      } catch (e) {
        allProducts = (initialProducts.length > 0 ? initialProducts : INITIAL_CHEESE_PRODUCTS);
      }

      const inventoryNames = allProducts.map((p: any) => p.name);
      const extractedItems = await extractDictationData(text, bcvRate, inventoryNames);
      
      if (extractedItems && extractedItems.length > 0) {
        const newItems: InvoiceItem[] = extractedItems.map(item => {
          const matchedProd = matchProductInCatalog(item.nombre, allProducts);
          const cost = item.costo_unitario || 0;
          const isBulto = item.unidad === 'Bulto';
          const defaultMargin = matchedProd && matchedProd.sellingPrice && matchedProd.purchasePrice 
            ? Math.round(((matchedProd.sellingPrice - matchedProd.purchasePrice) / matchedProd.purchasePrice) * 100)
            : 30;
          const sale = cost * (1 + (defaultMargin / 100));
          const totalQty = isBulto ? (item.cantidad * 10) : (item.cantidad || 1); // Asumimos 10 por bulto por defecto

          return {
            id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            productId: matchedProd ? matchedProd.id : 'NEW',
            name: matchedProd ? matchedProd.name : item.nombre.toUpperCase().trim(),
            quantity: totalQty,
            unitType: isBulto ? 'bulto' : 'unidad',
            unitsPerBulto: 10,
            costPrice: cost,
            marginPercent: defaultMargin,
            salePrice: parseFloat(sale.toFixed(2)),
            subtotal: parseFloat((cost * totalQty).toFixed(2)),
            unit: item.unidad as any
          };
        });

        setItems(prev => {
           const next = [...prev];
           newItems.forEach(ni => {
             const existingIdx = next.findIndex(x => x.name.toUpperCase() === ni.name.toUpperCase());
             if (existingIdx !== -1) {
               next[existingIdx].quantity += ni.quantity;
               next[existingIdx].subtotal = parseFloat((next[existingIdx].quantity * next[existingIdx].costPrice).toFixed(2));
             } else {
               next.push(ni);
             }
           });
           return next;
        });
      }
    } catch (e: any) {
      console.error("Error al procesar dictado:", e);
    } finally {
      setIsScanning(false);
    }
  };

  const handleImageScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setApiHealthStatus('checking');

    try {
      let allProducts: any[] = [];
      try {
        const prods = await fetchCollection('products');
        allProducts = Array.isArray(prods) ? prods : (initialProducts.length > 0 ? initialProducts : INITIAL_CHEESE_PRODUCTS);
      } catch (e) {
        allProducts = initialProducts.length > 0 ? initialProducts : INITIAL_CHEESE_PRODUCTS;
      }
      const inventoryNames = allProducts.map((p: any) => p.name);

      const extracted = await extractInvoiceData(file, bcvRate, inventoryNames);
      setApiHealthStatus('online');

      if (extracted.proveedor?.nombre || extracted.proveedor?.rif) {
        const supNombreNorm = normalizeTextForMatching(extracted.proveedor.nombre);
        const supRifClean = (extracted.proveedor.rif || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

        const matchedSup = suppliers.find(s => {
          const sNameNorm = normalizeTextForMatching(s.name);
          const sIdClean = (s.idNumber || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          return (
            (supRifClean && sIdClean && (sIdClean.includes(supRifClean) || supRifClean.includes(sIdClean))) ||
            (supNombreNorm && (sNameNorm.includes(supNombreNorm) || supNombreNorm.includes(sNameNorm)))
          );
        });

        if (matchedSup) {
          setSupplierId(matchedSup.id);
          setDetectedInvoiceInfo(`Proveedor detectado: ${matchedSup.name} (Doc #${extracted.factura || 'S/N'})`);
        } else {
          setDetectedInvoiceInfo(`Proveedor detectado en foto: ${extracted.proveedor.nombre || 'S/N'} (${extracted.proveedor.rif || 'S/R'})`);
        }
      }

      if (extracted.items && extracted.items.length > 0) {
        const newItems: InvoiceItem[] = extracted.items.map(item => {
          const matchedProd = matchProductInCatalog(item.nombre, allProducts);
          const isBulto = item.unidad === 'Bulto';
          const defaultMargin = matchedProd && matchedProd.sellingPrice && matchedProd.purchasePrice 
            ? Math.round(((matchedProd.sellingPrice - matchedProd.purchasePrice) / matchedProd.purchasePrice) * 100)
            : 30;
          const cost = item.costo_unitario || 0;
          const sale = cost * (1 + (defaultMargin / 100));
          const totalQty = isBulto ? (item.cantidad * 10) : (item.cantidad || 1);

          return {
            id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            productId: matchedProd ? matchedProd.id : 'NEW',
            name: matchedProd ? matchedProd.name : item.nombre.toUpperCase().trim(),
            quantity: totalQty,
            unitType: isBulto ? 'bulto' : 'unidad',
            unitsPerBulto: 10,
            costPrice: cost,
            marginPercent: defaultMargin,
            salePrice: parseFloat(sale.toFixed(2)),
            subtotal: parseFloat((cost * totalQty).toFixed(2)),
            unit: item.unidad as any
          };
        });

        setItems(prev => {
          const next = [...prev];
          newItems.forEach(ni => {
             const existingIdx = next.findIndex(x => x.name.toUpperCase() === ni.name.toUpperCase());
             if (existingIdx !== -1) {
               next[existingIdx].quantity += ni.quantity;
               next[existingIdx].subtotal = parseFloat((next[existingIdx].quantity * next[existingIdx].costPrice).toFixed(2));
             } else {
               next.push(ni);
             }
          });
          return next;
        });
      }
    } catch (error: any) {
      console.error("Error OCR:", error);
      setApiHealthStatus('offline');
      alert(error.message || "Fallo al escanear la imagen con IA.");
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  // Helper seguro para parsing numérico con soporte coma/punto
  const parseSafeNumber = (val: any, fallback: number = 0): number => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'number') return isNaN(val) ? fallback : val;
    const str = String(val).trim().replace(',', '.');
    const parsed = parseFloat(str);
    return isNaN(parsed) ? fallback : parsed;
  };

  const createInvoiceItem = (productId: string, name: string, qty: any, cost: any): InvoiceItem => {
    const validQty = Math.max(1, parseSafeNumber(qty, 1));
    const validCost = Math.max(0, parseSafeNumber(cost, 0));
    const finalQty = unitType === 'bulto' ? validQty * (Number(unitsPerBulto) || 1) : validQty;
    const defaultMargin = 30; // 30% por defecto
    const sale = validCost * (1 + (defaultMargin / 100));
    
    return {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,
      productId,
      name,
      quantity: finalQty,
      unitType,
      unitsPerBulto: Number(unitsPerBulto) || 10,
      costPrice: validCost,
      marginPercent: defaultMargin,
      salePrice: parseFloat(sale.toFixed(2)),
      subtotal: parseFloat((validCost * finalQty).toFixed(2))
    };
  };

  const handleAddProduct = (prod: CheeseProduct | { id: string, name: string }) => {
    // Tomar costo existente si lo hay, o 0
    const cost = (prod as CheeseProduct).purchasePrice || 0;
    const newItem = createInvoiceItem(prod.id, prod.name, 1, cost);
    setItems(prev => [...prev, newItem]);
    setSearchTerm('');
    setSearchResults([]);
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      let updated = { ...item };
      
      if (field === 'name') {
        updated.name = String(value);
        return updated;
      }

      const safeVal = parseSafeNumber(value, 0);

      const currentCost = field === 'costPrice' ? safeVal : (parseSafeNumber(item.costPrice, 0));
      const currentQty = field === 'quantity' ? safeVal : (parseSafeNumber(item.quantity, 0));
      const currentMargin = field === 'marginPercent' ? safeVal : (parseSafeNumber(item.marginPercent, 0));
      const currentSale = field === 'salePrice' ? safeVal : (parseSafeNumber(item.salePrice, 0));

      // Lógica de cálculo en cadena y sincronización inmediata de subtotal
      if (field === 'costPrice') {
        updated.costPrice = safeVal;
        updated.salePrice = parseFloat((currentCost * (1 + (currentMargin / 100))).toFixed(2));
        updated.subtotal = parseFloat((currentCost * currentQty).toFixed(2));
      } else if (field === 'marginPercent') {
        updated.marginPercent = safeVal;
        updated.salePrice = parseFloat((currentCost * (1 + (currentMargin / 100))).toFixed(2));
        updated.subtotal = parseFloat((currentCost * currentQty).toFixed(2));
      } else if (field === 'salePrice') {
        updated.salePrice = safeVal;
        updated.marginPercent = currentCost > 0 
          ? parseFloat((((currentSale - currentCost) / currentCost) * 100).toFixed(1))
          : 100;
        updated.subtotal = parseFloat((currentCost * currentQty).toFixed(2));
      } else if (field === 'quantity') {
        updated.quantity = safeVal;
        updated.subtotal = parseFloat((currentCost * currentQty).toFixed(2));
      } else {
        (updated as any)[field] = value;
      }
      
      return updated;
    }));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleFreezeDraft = async () => {
    if (items.length === 0) {
      alert("Agregue al menos un artículo para congelar el borrador.");
      return;
    }
    setIsSaving(true);
    try {
      await addLocalDoc('daily_drafts', {
        type: 'invoice_draft',
        items,
        supplierId,
        isCredit,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      });
      alert("✅ Borrador congelado con éxito.");
      setItems([]);
    } catch (e) {
      console.error(e);
      alert("Error al congelar borrador.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreDraft = (draft: InvoiceDraft, shouldDelete: boolean = false) => {
    if (items.length > 0) {
      const confirmReplace = window.confirm("Ya tienes artículos en la tabla actual. ¿Deseas reemplazarlos con el borrador descongelado?");
      if (!confirmReplace) return;
    }

    // Normalizar subtotales para garantizar cálculo exacto
    const sanitizedItems = (draft.items || []).map(it => {
      const c = Number(it.costPrice) || 0;
      const q = Number(it.quantity) || 1;
      return {
        ...it,
        costPrice: c,
        quantity: q,
        subtotal: parseFloat((c * q).toFixed(2))
      };
    });

    setItems(sanitizedItems);
    if (draft.supplierId) setSupplierId(draft.supplierId);
    if (typeof draft.isCredit === 'boolean') setIsCredit(draft.isCredit);
    setShowDraftsModal(false);

    if (shouldDelete && draft.id) {
      deleteLocalDoc('daily_drafts', draft.id).catch(console.error);
    }
  };

  const handleDeleteDraft = async (draftId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("¿Estás seguro de eliminar este borrador congelado?")) return;
    try {
      await deleteLocalDoc('daily_drafts', draftId);
    } catch (err) {
      console.error("Error al eliminar borrador:", err);
    }
  };

  const handleFinalSave = async () => {
    if (items.length === 0) {
      alert("⚠️ No hay artículos en la factura para procesar.");
      return;
    }
    
    // Validar que los ítems tengan datos válidos
    const invalidItems = items.filter(it => (Number(it.quantity) || 0) <= 0 || (Number(it.costPrice) || 0) < 0);
    if (invalidItems.length > 0) {
      alert(`⚠️ Hay ${invalidItems.length} artículo(s) con cantidad o costo inválido. Por favor corríjalos antes de guardar.`);
      return;
    }

    setIsSaving(true);
    try {
      const totalInvoiceCost = items.reduce((sum, item) => sum + (Number(item.subtotal) || (Number(item.costPrice || 0) * Number(item.quantity || 0))), 0);

      // 1. Resolver o Crear Proveedor si es nuevo o vino de la IA
      let effectiveSupplierId = supplierId;
      let effectiveSupplierName = 'Factura Externa';

      try {
        const currentSups = await fetchCollection('suppliers') || [];
        
        let foundSup = currentSups.find((s: any) => s.id === supplierId);
        if (!foundSup && detectedInvoiceInfo) {
          // Intentar match por nombre extraído
          foundSup = currentSups.find((s: any) => normalizeTextForMatching(s.name).includes(normalizeTextForMatching(detectedInvoiceInfo)));
        }

        if (foundSup) {
          effectiveSupplierId = foundSup.id;
          effectiveSupplierName = foundSup.name;
        } else if (supplierId && supplierId.trim() !== '') {
          effectiveSupplierName = supplierId;
        }
      } catch (e) {
        console.warn("Error resolviendo proveedores:", e);
      }

      // 2. Guardar factura en compras
      const savedPurchase = await addLocalDoc('purchases', {
        supplierId: effectiveSupplierId,
        supplierName: effectiveSupplierName,
        isCredit,
        items,
        totalCost: totalInvoiceCost,
        date: new Date().toISOString(),
        status: 'Completado'
      });

      if (!savedPurchase) {
        throw new Error("No se pudo registrar la factura en la base de datos de compras.");
      }

      // 3. Actualizar Inventario Atómicamente (por cada item)
      let allProductsList: any[] = [];
      try {
        const prods = await fetchCollection('products');
        allProductsList = Array.isArray(prods) ? prods : [];
      } catch (e) {
        allProductsList = [];
      }

      let updatedCount = 0;
      let createdCount = 0;

      for (const item of items) {
        let prevStock = 0;
        
        const isBulto = item.unitType === 'bulto' || item.unit === 'Bulto';
        const finalUnit = isBulto ? 'Und' : (item.unit === 'Und' ? 'Und' : (item.unit || 'Kg'));

        // Emparejamiento preventivo final: Buscar por ID o por coincidencia normalizada
        let targetProd = allProductsList.find((p: any) => p.id === item.productId && item.productId !== 'NEW');
        if (!targetProd) {
          targetProd = matchProductInCatalog(item.name, allProductsList);
        }

        if (targetProd) {
          prevStock = Number(targetProd.stockKg) || 0;
          const updatedStock = prevStock + Number(item.quantity);

          await updateLocalDoc('products', targetProd.id, {
            purchasePrice: Number(item.costPrice),
            sellingPrice: Number(item.salePrice) > 0 ? Number(item.salePrice) : (targetProd.sellingPrice || 0),
            stockKg: updatedStock,
            unit: targetProd.unit || finalUnit
          });
          updatedCount++;
        } else {
          // Crear nuevo producto en inventario con estructura canónica
          const newDoc = {
            name: item.name.trim(),
            stockKg: Number(item.quantity),
            purchasePrice: Number(item.costPrice),
            sellingPrice: Number(item.salePrice),
            category: 'Víveres',
            unit: finalUnit,
            alertThreshold: 5,
            agingDays: 0,
            origin: effectiveSupplierName
          };
          const created = await addLocalDoc('products', newDoc);
          if (created && created.id) {
            allProductsList.push({ ...newDoc, id: created.id });
            createdCount++;
          }
        }

        // Add Kardex Movement con cantidades y unidades exactas del producto real
        try {
          const resolvedUnit = targetProd?.unit || (item.unit === 'Und' ? 'Und' : (item.unitType === 'bulto' ? 'Und' : (item.unit || 'Kg')));
          await addLocalDoc('kardex', {
            productId: targetProd ? targetProd.id : 'NUEVO',
            productName: targetProd ? targetProd.name : item.name,
            type: 'ENTRADA_COMPRA',
            concept: settlingTrip ? 'Liquidación Gira San Juan / Compra Víveres' : `Compra Factura (${effectiveSupplierName})`,
            quantity: Number(item.quantity),
            previousStock: prevStock,
            newStock: prevStock + Number(item.quantity),
            unitCost: Number(item.costPrice),
            totalCost: Number(item.costPrice) * Number(item.quantity),
            unit: resolvedUnit,
            referenceId: `FAC-${Date.now().toString().slice(-6)}`,
            documentRef: settlingTrip ? `Viaje #${settlingTrip.tripNumber}` : effectiveSupplierName,
            userOrCashier: 'Contador IA',
            date: new Date().toISOString()
          });
        } catch (e) {
          console.error("Error al registrar en kardex:", e);
        }
      }

      // 4. Persistencia de Cuentas por Pagar (CXP) y Registro de Transacción
      if (effectiveSupplierId) {
        try {
          const sups = (await fetchCollection('suppliers')) || [];
          const s = sups.find((x: any) => x.id === effectiveSupplierId || normalizeTextForMatching(x.name) === normalizeTextForMatching(effectiveSupplierName));
          
          if (s) {
            if (isCredit) {
              const currentBalance = Number(s.balanceOwed) || 0;
              const newBalance = currentBalance + Number(totalInvoiceCost);
              await updateLocalDoc('suppliers', s.id, {
                balanceOwed: newBalance
              });
            }

            // Registrar transacción contable asociada al proveedor para que aparezca en su historial
            await addLocalDoc('transactions', {
              category: 'compras',
              entity: s.name || effectiveSupplierName,
              supplierId: s.id,
              amount: totalInvoiceCost,
              isIncome: false,
              status: 'Completado',
              invoiceNumber: `FAC-${Date.now().toString().slice(-6)}`,
              paymentMethod: isCredit ? 'A la Libreta / Crédito' : 'Contado / Caja',
              notes: `Compra de mercancía vía Factura Inteligente (${items.length} artículos)`,
              date: new Date().toISOString(),
              createdAt: Date.now()
            });
          }
        } catch (e) {
          console.error("Error al actualizar deuda y transacción del proveedor:", e);
        }
      }

      // 5. Integración con Viaje San Juan (Si aplica)
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

          const invoicesList = settlingTrip.invoices || [];
          invoicesList.push({
            id: `INV-${Date.now()}`,
            supplierName: effectiveSupplierName,
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

          if (totalSettlementValue >= tripBagValue) {
            updateData.status = 'liquidado';
            updateData.settledAt = new Date().toISOString();
            await onSettleTrip(settlingTrip.id, updateData);
          } else {
            await updateLocalDoc('cheeseTrips', settlingTrip.id, updateData);
          }
        } catch (e) {
          console.error("Error al amortizar viaje:", e);
        }
      }

      alert(`✅ Factura procesada con éxito:\n• ${items.length} artículos procesados (${updatedCount} actualizados, ${createdCount} nuevos).\n• Total cargado: $${totalInvoiceCost.toFixed(2)} USD.\n• Kardex y Cuentas sincronizadas.`);
      setItems([]);
      setSearchTerm('');
    } catch (error: any) {
      console.error("Error al procesar compra:", error);
      alert(`❌ ERROR AL GUARDAR: ${error.message || 'No se pudo sincronizar con la base de datos local.'}\n\nPor favor revise su conexión al servidor backend.`);
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
        if (vaultUsd > 0) {
          onAddTransaction({
            category: 'ventas',
            amount: vaultUsd,
            isIncome: true,
            notes: `Retorno Viaje #${settlingTrip.tripNumber} (Efectivo USD $${vaultUsd.toFixed(2)})`,
            paymentMethod: 'Efectivo USD'
          });
        }
        if (vaultBs > 0) {
          onAddTransaction({
            category: 'ventas',
            amount: vaultBs / bcvRate,
            isIncome: true,
            notes: `Retorno Viaje #${settlingTrip.tripNumber} (Efectivo Bs. ${vaultBs.toLocaleString('es-VE')})`,
            paymentMethod: 'Efectivo BS'
          });
        }
        if (vaultBankBs > 0) {
          onAddTransaction({
            category: 'ventas',
            amount: vaultBankBs / bcvRate,
            isIncome: true,
            notes: `Retorno Viaje #${settlingTrip.tripNumber} (Banco / Pago Móvil Bs. ${vaultBankBs.toLocaleString('es-VE')})`,
            paymentMethod: 'Banco / Pago Móvil'
          });
        }
        if (vaultBankUsd > 0) {
          onAddTransaction({
            category: 'ventas',
            amount: vaultBankUsd,
            isIncome: true,
            notes: `Retorno Viaje #${settlingTrip.tripNumber} (Banco USD $${vaultBankUsd.toFixed(2)})`,
            paymentMethod: 'Banco USD'
          });
        }
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
        await updateLocalDoc('cheeseTrips', settlingTrip.id, updateData);
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

  const grandTotal = useMemo(() => {
    return items.reduce((sum, i: any) => {
      const cost = Number(i.costPrice ?? i.purchasePrice ?? i.unitCost ?? i.cost ?? 0) || 0;
      const qty = Number(i.quantity ?? i.quantityKg ?? i.qty ?? 1) || 1;
      const sub = Number(i.subtotal);
      const validSub = !isNaN(sub) && sub > 0 ? sub : (cost * qty);
      return sum + (!isNaN(validSub) ? validSub : 0);
    }, 0);
  }, [items]);

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

        <div className="flex items-center gap-2 flex-wrap">
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

          {/* Botón: Descongelar Borradores */}
          <button 
            type="button"
            onClick={() => setShowDraftsModal(true)}
            disabled={isSaving}
            className="bg-cyan-950/40 border border-cyan-800/80 hover:bg-cyan-900/60 text-cyan-300 px-3.5 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 transition-all cursor-pointer shadow-md disabled:opacity-50"
            title="Ver y restaurar borradores guardados"
          >
            <FolderOpen className="w-4 h-4 text-cyan-400" />
            <span>Descongelar</span>
            {savedDrafts.length > 0 && (
              <span className="bg-cyan-500 text-zinc-950 text-[10px] font-mono font-black px-1.5 py-0.2 rounded-full">
                {savedDrafts.length}
              </span>
            )}
          </button>

          {/* Botón: Congelar Borrador Actual */}
          <button 
            type="button"
            onClick={handleFreezeDraft}
            disabled={isSaving || items.length === 0}
            className="bg-zinc-900 border border-zinc-700 hover:border-cyan-500 text-zinc-300 hover:text-cyan-300 px-3.5 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            title="Guardar estado actual para continuar más tarde"
          >
            <Snowflake className="w-4 h-4 text-cyan-400" />
            <span>Congelar</span>
          </button>
          
          {/* Input para Cámara directa */}
          <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handleImageScan} />
          
          {/* Input para Galería / Explorador de Archivos */}
          <input type="file" accept="image/*,.pdf" className="hidden" ref={galleryInputRef} onChange={handleImageScan} />
          
          {/* Botón 1: Galería / Archivos */}
          <button 
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={isScanning || isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-700 hover:border-emerald-500 text-zinc-300 hover:text-emerald-400 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-md disabled:opacity-50"
            title="Seleccionar foto de factura desde la galería o archivos"
          >
            <span className="flex items-center justify-center w-4 h-4">
              {isScanning ? <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> : <ImageIcon className="w-4 h-4 text-emerald-400" />}
            </span>
            <span className="hidden sm:inline">Galería</span>
          </button>

          {/* Botón 2: Tomar Foto con Cámara */}
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning || isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-md disabled:opacity-50"
            title="Tomar foto directa a la factura"
          >
            <span className="flex items-center justify-center w-4 h-4">
              {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </span>
            <span>Cámara</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        
        {/* Panel Central (Buscador y Tabla) */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-zinc-800">
          
          {/* Action Bar (Búsqueda + Dictado + Toggle Bulto) */}
          <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 shrink-0 space-y-4">
            
            {/* Status Badge de la IA de Gemini */}
            <div className="flex items-center justify-between bg-zinc-950/80 border border-zinc-800/80 px-3 py-1.5 rounded-lg text-[11px] font-mono">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-zinc-400">Motor OCR: <strong className="text-zinc-200">Gemini 2.5 / 3.7 Flash</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                {apiHealthStatus === 'checking' && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> Verificando API...
                  </span>
                )}
                {apiHealthStatus === 'online' && (
                  <span className="flex items-center gap-1 text-emerald-400 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> IA Conectada
                  </span>
                )}
                {apiHealthStatus === 'offline' && (
                  <span className="flex items-center gap-1 text-rose-400 font-bold" title={apiHealthMessage}>
                    <WifiOff className="w-3 h-3 text-rose-400" /> Clave API Desconectada
                  </span>
                )}
              </div>
            </div>

            {detectedInvoiceInfo && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-lg flex items-center justify-between text-xs text-emerald-400 font-mono">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{detectedInvoiceInfo}</span>
                </div>
                <button 
                  onClick={() => setDetectedInvoiceInfo('')} 
                  className="text-emerald-500 hover:text-emerald-300 font-bold px-1.5"
                >
                  ✕
                </button>
              </div>
            )}
            
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
                          type="text" 
                          inputMode="decimal"
                          value={item.quantity} 
                          onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                          className="w-20 bg-zinc-950 border border-zinc-700 text-center text-sm font-mono text-zinc-100 rounded px-2 py-1 focus:outline-none focus:border-brand-accent"
                        />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <input 
                          type="text" 
                          inputMode="decimal"
                          value={item.costPrice} 
                          onChange={(e) => updateItem(item.id, 'costPrice', e.target.value)}
                          className="w-24 bg-zinc-950 border border-zinc-700 text-right text-sm font-mono text-rose-400 rounded px-2 py-1 focus:outline-none focus:border-rose-500"
                        />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <input 
                          type="text" 
                          inputMode="decimal"
                          value={item.marginPercent} 
                          onChange={(e) => updateItem(item.id, 'marginPercent', e.target.value)}
                          className="w-14 bg-zinc-950 border border-zinc-700 text-center text-sm font-mono text-emerald-400 rounded px-1 py-1 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <input 
                          type="text" 
                          inputMode="decimal"
                          value={item.salePrice} 
                          onChange={(e) => updateItem(item.id, 'salePrice', e.target.value)}
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
              type="button"
              onClick={handleFinalSave}
              disabled={items.length === 0 || isSaving}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black uppercase tracking-widest text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <span className="flex items-center justify-center w-5 h-5">
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              </span>
              <span>Guardar e Incrementar</span>
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
      {/* Modal Descongelar Borradores */}
      {showDraftsModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-950 border border-cyan-800/60 p-6 rounded-2xl shadow-2xl shadow-cyan-950/40 w-full max-w-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-700/50">
                  <Snowflake className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-lg font-serif font-bold text-white">Borradores Congelados</h2>
                  <p className="text-xs text-cyan-400/80 font-mono">Selecciona una factura para restaurarla y continuar</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowDraftsModal(false)}
                className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {savedDrafts.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 font-mono space-y-2">
                  <Snowflake className="w-10 h-10 mx-auto text-zinc-700 opacity-40" />
                  <p className="text-sm">No hay borradores congelados guardados.</p>
                  <p className="text-xs text-zinc-600">Al presionar "Congelar" en una factura, aparecerá aquí.</p>
                </div>
              ) : (
                savedDrafts.map((draft, idx) => {
                  const draftItemsCount = draft.items?.length || 0;
                  const draftTotal = (draft.items || []).reduce((acc, it) => acc + (Number(it.subtotal) || (Number(it.costPrice || 0) * Number(it.quantity || 0))), 0);
                  const supObj = suppliers.find(s => s.id === draft.supplierId);
                  const formattedDate = draft.createdAt 
                    ? new Date(draft.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : draft.date || 'Hoy';

                  return (
                    <div 
                      key={draft.id || `draft-${idx}`}
                      className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 hover:border-cyan-500/50 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-cyan-300">
                            {supObj ? supObj.name : 'Proveedor General'}
                          </span>
                          {draft.isCredit && (
                            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono">
                              Crédito
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 font-mono flex items-center gap-3">
                          <span>📦 {draftItemsCount} {draftItemsCount === 1 ? 'artículo' : 'artículos'}</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-bold">${draftTotal.toFixed(2)} USD</span>
                          <span>•</span>
                          <span className="text-zinc-500 text-[11px]">{formattedDate}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <button
                          type="button"
                          onClick={() => handleRestoreDraft(draft, false)}
                          className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 rounded-lg text-xs font-bold uppercase transition-colors cursor-pointer shadow-md"
                        >
                          Cargar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRestoreDraft(draft, true)}
                          className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-bold uppercase transition-colors cursor-pointer"
                          title="Cargar a la tabla y eliminar de la lista de borradores"
                        >
                          Cargar y Liberar
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteDraft(draft.id, e)}
                          className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Eliminar borrador"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowDraftsModal(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg text-xs font-bold uppercase transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
