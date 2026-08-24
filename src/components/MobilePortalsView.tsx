import React, { useState } from 'react';
import {
  Smartphone,
  ShoppingBag,
  User,
  Package,
  CheckCircle,
  Truck,
  CreditCard,
  Plus,
  Minus,
  Trash2,
  Clock,
  ArrowRight,
  Shield,
  FileText,
  TrendingDown,
  Search,
  ChevronRight,
  LogOut,
  UserCheck,
  Phone,
  Grid,
  MapPin,
  Heart,
  QrCode,
  Scan
} from 'lucide-react';
import { CheeseProduct, ClientProfile, SupplierProfile, MobileOrder } from '../types';
import InvoiceUploadView from './contador/InvoiceUploadView';

interface MobilePortalsViewProps {
  products: CheeseProduct[];
  clients: ClientProfile[];
  suppliers: SupplierProfile[];
  mobileOrders: MobileOrder[];
  onAddMobileOrder: (order: MobileOrder) => void;
  onDeliverMobileOrder: (orderId: string) => void;
  onCancelMobileOrder: (orderId: string) => void;
  onAddNotification: (msg: string, type: 'success' | 'info' | 'warning') => void;
  isolatedType?: 'cliente' | 'productor' | 'proveedor' | 'contador';
  isolatedId?: string;
}

interface CatalogProduct {
  id: string;
  name: string;
  category: 'Repuestos' | 'Comidas' | 'Quesos';
  price: number;
  unit: string;
  stock: number;
}

// Simulated large product catalog containing motorcycle parts (repuestos de moto), comida, and quesos
const MOBILE_CATALOG: CatalogProduct[] = [
  // Repuestos de Moto (Motorcycle Parts)
  { id: 'rep-1', name: 'Llanta de Moto Deportiva Trasera 18" Premium', category: 'Repuestos', price: 1250, unit: 'pza', stock: 12 },
  { id: 'rep-2', name: 'Kit de Arrastre Reforzado Italika/Yamaha FT150', category: 'Repuestos', price: 680, unit: 'kit', stock: 8 },
  { id: 'rep-3', name: 'Cadena de Tracción Reforzada Dorada #428', category: 'Repuestos', price: 290, unit: 'pza', stock: 15 },
  { id: 'rep-4', name: 'Aceite de Motor Motul 4T 20W50 Original (1L)', category: 'Repuestos', price: 185, unit: 'L', stock: 32 },
  { id: 'rep-5', name: 'Bujía de Iridio NGK de Alto Rendimiento', category: 'Repuestos', price: 140, unit: 'pza', stock: 50 },
  { id: 'rep-6', name: 'Juego de Balatas de Freno Traseras/Delanteras', category: 'Repuestos', price: 120, unit: 'juego', stock: 18 },
  { id: 'rep-7', name: 'Espejos Retrovisores Universales Fibra de Carbono', category: 'Repuestos', price: 210, unit: 'par', stock: 10 },
  { id: 'rep-8', name: 'Cámara para Llanta de Moto Rin 17/18" Reforzada', category: 'Repuestos', price: 130, unit: 'pza', stock: 24 },
  { id: 'rep-9', name: 'Batería de Gel LTH 12V Sellada Libre Manto.', category: 'Repuestos', price: 590, unit: 'pza', stock: 6 },
  { id: 'rep-10', name: 'Foco LED Principal de Alta Intensidad H4', category: 'Repuestos', price: 175, unit: 'pza', stock: 15 },
  { id: 'rep-11', name: 'Puños de Goma Deportivos Antideslizantes', category: 'Repuestos', price: 95, unit: 'par', stock: 30 },
  { id: 'rep-12', name: 'Manija de Freno / Embrague Universal de Aluminio', category: 'Repuestos', price: 145, unit: 'pza', stock: 11 },

  // Comidas y Víveres (Meals & Supplies)
  { id: 'com-1', name: 'Plato Almuerzo Corrido Completo (Guisado del día)', category: 'Comidas', price: 95, unit: 'platillo', stock: 40 },
  { id: 'com-2', name: 'Desayuno de Rancho Completo (Huevos + Tortillas + Café)', category: 'Comidas', price: 85, unit: 'platillo', stock: 25 },
  { id: 'com-3', name: 'Saco de Maíz Blanco Desgranado Premium (50kg)', category: 'Comidas', price: 480, unit: 'saco', stock: 15 },
  { id: 'com-4', name: 'Bulto de Alimento Balanceado Vacas Lecheras (40kg)', category: 'Comidas', price: 620, unit: 'bulto', stock: 20 },
  { id: 'com-5', name: 'Kilo de Tortillas de Maíz Nixtamalizado Calientes', category: 'Comidas', price: 24, unit: 'kg', stock: 100 },
  { id: 'com-6', name: 'Café Molido Gourmet de la Región (500g)', category: 'Comidas', price: 130, unit: 'bolsa', stock: 16 },
  { id: 'com-7', name: 'Refresco Familiar Coca-Cola Original (1.5L)', category: 'Comidas', price: 32, unit: 'pza', stock: 60 },
  { id: 'com-8', name: 'Aceite de Cocina Comestible Aurrera (1L)', category: 'Comidas', price: 42, unit: 'pza', stock: 80 },
  { id: 'com-9', name: 'Frijol Negro de rancho seleccionado', category: 'Comidas', price: 38, unit: 'kg', stock: 120 },
  { id: 'com-10', name: 'Arroz Súper Extra grano entero', category: 'Comidas', price: 26, unit: 'kg', stock: 150 },
  { id: 'com-11', name: 'Litro de Leche Entera Pasteurizada Kalu', category: 'Comidas', price: 22, unit: 'L', stock: 90 },

  // Quesos y Lácteos (Cheddar/Manchego/Quesillo)
  { id: 'que-1', name: 'Queso Manchego de Oveja Curado', category: 'Quesos', price: 340, unit: 'kg', stock: 15 },
  { id: 'que-2', name: 'Queso Cotija Añejo Genuino', category: 'Quesos', price: 290, unit: 'kg', stock: 12 },
  { id: 'que-3', name: 'Quesillo de Hebra Oaxaca Especial', category: 'Quesos', price: 210, unit: 'kg', stock: 20 },
  { id: 'que-4', name: 'Queso Fresco de Rancho Molido', category: 'Quesos', price: 140, unit: 'kg', stock: 30 },
  { id: 'que-5', name: 'Crema Ácida Genuina de Rancho (Litro)', category: 'Quesos', price: 95, unit: 'L', stock: 25 },
  { id: 'que-6', name: 'Queso Panela para Asar tierno', category: 'Quesos', price: 165, unit: 'kg', stock: 14 }
];

export default function MobilePortalsView({
  products,
  clients,
  suppliers,
  mobileOrders,
  onAddMobileOrder,
  onDeliverMobileOrder,
  onCancelMobileOrder,
  onAddNotification,
  isolatedType,
  isolatedId
}: MobilePortalsViewProps) {
  // Authentication & Session States for Each Phone Simulator (Zero visual overlap or exposure between users)
  const [loggedClient, setLoggedClient] = useState<ClientProfile | null>(null);
  const [loggedSupplier, setLoggedSupplier] = useState<SupplierProfile | null>(null);

  // Login inputs
  const [clientPhoneInput, setClientPhoneInput] = useState<string>('');
  const [supplierPhoneInput, setSupplierPhoneInput] = useState<string>('');
  const [clientPinInput, setClientPinInput] = useState<string>('');
  const [supplierPinInput, setSupplierPinInput] = useState<string>('');

  // Auto-login logic for isolated mode
  React.useEffect(() => {
    if (isolatedId) {
      if (isolatedType === 'cliente') {
        const client = clients.find(c => c.id === isolatedId);
        if (client) setLoggedClient(client);
      } else if (isolatedType === 'productor' || isolatedType === 'proveedor') {
        const supplier = suppliers.find(s => s.id === isolatedId);
        if (supplier) setLoggedSupplier(supplier);
      }
    }
  }, [isolatedId, isolatedType, clients, suppliers]);

  // Shopping Catalog Local States (Separate for each portal)
  const [clientSearch, setClientSearch] = useState('');
  const [clientCategory, setClientCategory] = useState<'Todos' | 'Quesos' | 'Repuestos' | 'Comidas'>('Todos');
  const [clientCart, setClientCart] = useState<{ productId: string; quantity: number }[]>([]);
  const [clientPayment, setClientPayment] = useState<'contado' | 'fiado'>('contado');

  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierCategory, setSupplierCategory] = useState<'Todos' | 'Repuestos' | 'Comidas' | 'Quesos'>('Todos');
  const [supplierCart, setSupplierCart] = useState<{ productId: string; quantity: number }[]>([]);
  const [supplierPayment, setSupplierPayment] = useState<'contado' | 'fiado'>('fiado'); // default to 'fiado' (Libreta)

  // Employee Portal (Daisy)
  const [daisyScanned, setDaisyScanned] = useState(false);

  // Handlers for Client Portal Login
  const handleClientLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const phoneClean = clientPhoneInput.trim();
    if (!phoneClean) {
      onAddNotification('Por favor ingrese su usuario o teléfono.', 'warning');
      return;
    }
    
    const found = clients.find(c => 
      (c.phone && c.phone.replace(/\D/g, '').includes(phoneClean.replace(/\D/g, ''))) || 
      (c.name && c.name.toLowerCase().includes(phoneClean.toLowerCase())) ||
      (c.cedula && c.cedula.includes(phoneClean)) ||
      (c.rfc && c.rfc.includes(phoneClean))
    );

    if (found) {
      // PIN Check
      let expectedPin = '0000';
      if (found.pin) expectedPin = found.pin;
      else if (found.cedula && found.cedula.length >= 4) expectedPin = found.cedula.slice(-4);
      else if (found.rfc && found.rfc.length >= 4) expectedPin = found.rfc.slice(-4);
      else if (found.phone) {
         const ph = found.phone.replace(/\D/g, '');
         if (ph.length >= 4) expectedPin = ph.slice(-4);
      }
      
      if (clientPinInput === expectedPin) {
        setLoggedClient(found);
        setClientCart([]);
        onAddNotification(`¡Sesión iniciada como Cliente: ${found.name}!`, 'success');
      } else {
         onAddNotification('El PIN ingresado es incorrecto.', 'warning');
      }
    } else {
      onAddNotification('No se encontró ningún cliente registrado con esos datos.', 'warning');
    }
  };

  // Handlers for Supplier Portal Login (Libreta de Queso)
  const handleSupplierLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const phoneClean = supplierPhoneInput.trim();
    if (!phoneClean) {
      onAddNotification('Por favor ingrese su usuario o teléfono.', 'warning');
      return;
    }
    const found = suppliers.find(
      s => (s.phone && s.phone.replace(/\D/g, '').includes(phoneClean.replace(/\D/g, ''))) || 
           (s.name && s.name.toLowerCase().includes(phoneClean.toLowerCase())) ||
           (s.cedula && s.cedula.includes(phoneClean)) ||
           (s.rfc && s.rfc.includes(phoneClean))
    );

    if (found) {
      // PIN Check
      let expectedPin = '0000';
      if (found.pin) expectedPin = found.pin;
      else if (found.cedula && found.cedula.length >= 4) expectedPin = found.cedula.slice(-4);
      else if (found.rfc && found.rfc.length >= 4) expectedPin = found.rfc.slice(-4);
      else if (found.phone) {
         const ph = found.phone.replace(/\D/g, '');
         if (ph.length >= 4) expectedPin = ph.slice(-4);
      }

      if (supplierPinInput === expectedPin) {
        setLoggedSupplier(found);
        setSupplierCart([]);
        onAddNotification(`¡Sesión iniciada como Productor: ${found.name}!`, 'success');
      } else {
        onAddNotification('El PIN ingresado es incorrecto.', 'warning');
      }
    } else {
      onAddNotification('No se encontró ningún productor con esos datos.', 'warning');
    }
  };

  // Client Cart updates
  const handleClientCartAdd = (pId: string) => {
    const prod = MOBILE_CATALOG.find(p => p.id === pId);
    if (!prod) return;
    setClientCart((prev) => {
      const existing = prev.find(item => item.productId === pId);
      const inc = prod.category === 'Quesos' ? 0.5 : 1;
      if (existing) {
        if (existing.quantity + inc > prod.stock) {
          onAddNotification('Límite de stock disponible en bodega superado.', 'warning');
          return prev;
        }
        return prev.map(item => item.productId === pId ? { ...item, quantity: item.quantity + inc } : item);
      }
      return [...prev, { productId: pId, quantity: inc }];
    });
  };

  const handleClientCartRemove = (pId: string) => {
    setClientCart((prev) => {
      const existing = prev.find(item => item.productId === pId);
      if (existing) {
        const dec = MOBILE_CATALOG.find(p => p.id === pId)?.category === 'Quesos' ? 0.5 : 1;
        if (existing.quantity <= dec) {
          return prev.filter(item => item.productId !== pId);
        }
        return prev.map(item => item.productId === pId ? { ...item, quantity: existing.quantity - dec } : item);
      }
      return prev;
    });
  };

  // Supplier Cart updates
  const handleSupplierCartAdd = (pId: string) => {
    const prod = MOBILE_CATALOG.find(p => p.id === pId);
    if (!prod) return;
    setSupplierCart((prev) => {
      const existing = prev.find(item => item.productId === pId);
      const inc = prod.category === 'Quesos' ? 0.5 : 1;
      if (existing) {
        if (existing.quantity + inc > prod.stock) {
          onAddNotification('Límite de stock disponible superado.', 'warning');
          return prev;
        }
        return prev.map(item => item.productId === pId ? { ...item, quantity: item.quantity + inc } : item);
      }
      return [...prev, { productId: pId, quantity: inc }];
    });
  };

  const handleSupplierCartRemove = (pId: string) => {
    setSupplierCart((prev) => {
      const existing = prev.find(item => item.productId === pId);
      if (existing) {
        const dec = MOBILE_CATALOG.find(p => p.id === pId)?.category === 'Quesos' ? 0.5 : 1;
        if (existing.quantity <= dec) {
          return prev.filter(item => item.productId !== pId);
        }
        return prev.map(item => item.productId === pId ? { ...item, quantity: existing.quantity - dec } : item);
      }
      return prev;
    });
  };

  // Submit Client Order
  const submitClientOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedClient) return;
    if (clientCart.length === 0) {
      onAddNotification('El carrito está vacío.', 'warning');
      return;
    }

    const orderItems = clientCart.map(cartItem => {
      const prod = MOBILE_CATALOG.find(p => p.id === cartItem.productId)!;
      return {
        productId: prod.id,
        name: prod.name,
        quantity: cartItem.quantity,
        price: prod.price,
        subtotal: prod.price * cartItem.quantity
      };
    });

    const total = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

    const newOrder: MobileOrder = {
      id: `PED-CLI-${Date.now().toString().slice(-4)}`,
      type: 'client',
      entityId: loggedClient.id,
      entityName: loggedClient.name,
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      items: orderItems,
      total,
      paymentMethod: clientPayment,
      status: 'Pendiente'
    };

    onAddMobileOrder(newOrder);
    setClientCart([]);
    onAddNotification(`¡Pedido ${newOrder.id} enviado! Será cargado como: ${clientPayment === 'fiado' ? 'Fiado / Crédito' : 'Pago al retirar'}.`, 'success');
  };

  // Submit Supplier Order
  const submitSupplierOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggedSupplier) return;
    if (supplierCart.length === 0) {
      onAddNotification('El carrito está vacío.', 'warning');
      return;
    }

    const orderItems = supplierCart.map(cartItem => {
      const prod = MOBILE_CATALOG.find(p => p.id === cartItem.productId)!;
      return {
        productId: prod.id,
        name: prod.name,
        quantity: cartItem.quantity,
        price: prod.price,
        subtotal: prod.price * cartItem.quantity
      };
    });

    const total = orderItems.reduce((sum, item) => sum + item.subtotal, 0);

    const newOrder: MobileOrder = {
      id: `PED-PROV-${Date.now().toString().slice(-4)}`,
      type: 'supplier',
      entityId: loggedSupplier.id,
      entityName: loggedSupplier.name,
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      items: orderItems,
      total,
      paymentMethod: supplierPayment,
      status: 'Pendiente'
    };

    onAddMobileOrder(newOrder);
    setSupplierCart([]);
    onAddNotification(`¡Pedido de Insumos/Víveres ${newOrder.id} mandado a Libreta!`, 'success');
  };

  // Filtering Products for Client Portal
  const filteredClientProducts = MOBILE_CATALOG.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(clientSearch.toLowerCase());
    const matchesCat = clientCategory === 'Todos' || p.category === clientCategory;
    return matchesSearch && matchesCat;
  });

  // Filtering Products for Supplier Portal
  const filteredSupplierProducts = MOBILE_CATALOG.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(supplierSearch.toLowerCase());
    const matchesCat = supplierCategory === 'Todos' || p.category === supplierCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className={`animate-fade-in ${isolatedType ? 'w-full min-h-screen flex flex-col bg-black' : 'space-y-8 max-w-7xl mx-auto pb-16'}`}>
      {/* Header and Explanation */}
      {!isolatedType && (
        <div className="border-b border-editorial-border pb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-editorial-text-muted">
              PORTALES INDIVIDUALES PRIVADOS Y EXCLUSIVOS
            </span>
          </div>
          <h2 className="font-serif text-3xl font-bold tracking-tight text-editorial-text-primary">
            Portal de Productores: Libreta de Queso &amp; Cliente Normal
          </h2>
          <p className="text-xs text-editorial-text-muted/80 max-w-3xl mt-2 leading-relaxed">
            Cada usuario inicia sesión en su propio teléfono de forma aislada y segura. <strong>No pueden ver la información de otros clientes o productores.</strong> 
            Desde aquí consultan en tiempo real cuánto deben, revisan el catálogo completo (más de 1,000 productos simulados como repuestos de moto, comidas y quesos) 
            y realizan sus pedidos directo al CRM.
          </p>
        </div>
      )}

      {/* Grid of Devices */}
      <div className={`flex-1 flex flex-col ${!isolatedType ? 'grid grid-cols-1 lg:grid-cols-3 gap-8 items-start' : 'w-full'}`}>
        
        {/* PHONE 1: PORTAL CLIENTE NORMAL */}
        {(!isolatedType || isolatedType === 'cliente') && (
        <div className={!isolatedType ? "flex flex-col items-center bg-editorial-card/30 border border-editorial-border rounded-xl p-6 shadow-sm" : "w-full min-h-screen bg-black text-white flex flex-col"}>
          {!isolatedType && (
          <div className="text-center mb-4">
            <h3 className="text-xs font-mono uppercase tracking-widest font-bold text-editorial-text-primary mb-1">
              Dispositivo: Teléfono del Cliente
            </h3>
            <p className="text-[10px] text-editorial-text-muted">Acceso individual seguro</p>
          </div>
          )}

          {/* Smartphone Shell Mockup */}
          <div className={!isolatedType ? "w-[335px] h-[610px] bg-zinc-950 border-[8px] border-zinc-800 rounded-[38px] overflow-hidden shadow-2xl relative flex flex-col font-sans select-none" : "flex-1 w-full bg-zinc-950 flex flex-col font-sans select-none"}>
            {/* Speaker & Camera Notch */}
            {!isolatedType && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-4.5 bg-zinc-800 rounded-b-xl z-20 flex justify-center items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-900 mr-2" />
              <div className="w-10 h-1 rounded-full bg-zinc-900" />
            </div>
            )}

            {/* Screen Content */}
            <div className={`flex-1 overflow-y-auto bg-zinc-900 text-zinc-100 flex flex-col text-xs ${!isolatedType ? 'p-4 pt-7' : 'px-4 py-6'}`}>
              
              {!loggedClient ? (
                /* CLIENT PORTAL: LOCK / LOGIN SCREEN */
                <div className="flex-1 flex flex-col justify-between py-6">
                  <div className="text-center mt-6 space-y-2">
                    <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto">
                      <ShoppingBag className="w-6 h-6 text-amber-500" />
                    </div>
                    <h4 className="font-serif text-lg font-bold text-zinc-100">Kalu Móvil</h4>
                    <p className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest">Tienda en Línea</p>
                  </div>

                  <form onSubmit={handleClientLoginSubmit} className="space-y-4 bg-zinc-950/50 p-4 rounded-xl border border-zinc-800">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-zinc-400 block">Cédula, Celular o Nombre:</label>
                      <input
                        type="text"
                        placeholder="Ej. 15082352, o Antonio"
                        value={clientPhoneInput}
                        onChange={(e) => setClientPhoneInput(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-zinc-400 block">PIN de Acceso (4 dígitos):</label>
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="••••"
                        value={clientPinInput}
                        onChange={(e) => setClientPinInput(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500 font-mono tracking-[0.5em] text-center"
                      />
                    </div>
                    
                    <button
                      type="submit"
                      className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold uppercase rounded text-[10px] tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Ingresar a mi Cuenta
                    </button>

                    <div className="pt-2 border-t border-zinc-800 text-center">
                      <span className="text-[8px] text-zinc-500 block">Cuentas demo disponibles:</span>
                      <div className="flex flex-wrap gap-1 justify-center mt-1">
                        {clients.slice(0, 3).map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setClientPhoneInput(c?.name || '')}
                            className="bg-zinc-800 hover:bg-zinc-700 text-[8px] text-zinc-300 px-1.5 py-0.5 rounded transition-all"
                          >
                            {(c?.name || 'Cliente').split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </form>

                  <div className="text-center text-[8px] text-zinc-500 space-y-1">
                    <p>🔒 Conexión Protegida y Encriptada</p>
                    <p>Kalu CRM S.A. de C.V.</p>
                  </div>
                </div>
              ) : (
                /* CLIENT PORTAL: LOGGED IN STORE & ACCOUNT */
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Internal Bar */}
                  <div className="flex justify-between items-center border-b border-zinc-800 pb-2 mb-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <div>
                        <p className="font-bold text-zinc-100 leading-none">{loggedClient.name}</p>
                        <p className="text-[8px] text-zinc-400 mt-0.5">Cliente Normal</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setLoggedClient(null);
                        setClientCart([]);
                      }}
                      className="p-1 text-zinc-500 hover:text-zinc-300 rounded"
                      title="Cerrar sesión"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Private Balance & Loyalty Card */}
                  <div className="bg-gradient-to-br from-zinc-950 to-zinc-900 border border-zinc-800/80 rounded-xl p-3 mb-3.5 relative overflow-hidden">
                    <div className="absolute right-2 top-2 opacity-5">
                      <ShoppingBag className="w-16 h-16 text-zinc-100" />
                    </div>
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[8px] font-mono uppercase text-zinc-400 block">Mi Estado de Cuenta:</span>
                        <p className="text-xs font-bold text-zinc-200 mt-0.5">
                          Fiar en Tienda: <span className="text-amber-500 font-mono">${loggedClient.outstandingDebt.toFixed(2)} M.N.</span>
                        </p>
                        <p className="text-[8px] text-zinc-500 font-mono mt-0.5">Límite Permitido: $5,000.00 M.N.</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] font-mono uppercase text-zinc-400 block">Puntos Kalu:</span>
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          ⭐️ {loggedClient.loyaltyPoints} pts
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* VIRTUAL STORE SEARCH & CATEGORIES */}
                  <div className="space-y-2 mb-3">
                    {/* Search bar inside phone */}
                    <div className="relative">
                      <Search className="w-3 h-3 text-zinc-500 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        placeholder="Buscar repuestos, comidas, quesos..."
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 pl-7 text-[10px] text-zinc-200 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    {/* Category tabs */}
                    <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar text-[9px] font-mono">
                      {(['Todos', 'Quesos', 'Repuestos', 'Comidas'] as const).map(cat => (
                        <button
                          key={cat}
                          onClick={() => setClientCategory(cat)}
                          className={`px-2 py-1 rounded-full border transition-all shrink-0 ${
                            clientCategory === cat
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 font-bold'
                              : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Catalog display */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                    {filteredClientProducts.length === 0 ? (
                      <p className="text-center text-[10px] text-zinc-500 py-4 font-mono">No se encontraron productos</p>
                    ) : (
                      filteredClientProducts.map(p => {
                        const cartItem = clientCart.find(item => item.productId === p.id);
                        return (
                          <div key={p.id} className="bg-zinc-800/60 border border-zinc-700/40 rounded-lg p-2 flex justify-between items-center transition-all">
                            <div>
                              <div className="flex items-center gap-1">
                                <span className={`px-1 py-0.2 rounded text-[7px] font-mono uppercase ${
                                  p.category === 'Repuestos' ? 'bg-blue-500/20 text-blue-400' :
                                  p.category === 'Comidas' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                                }`}>
                                  {p.category}
                                </span>
                                <p className="font-bold text-zinc-200 text-[10.5px] max-w-[150px] truncate leading-tight">{p.name}</p>
                              </div>
                              <p className="text-[10px] text-amber-500 font-mono mt-0.5">
                                ${p.price.toFixed(2)} <span className="text-zinc-500 text-[8px]">/{p.unit}</span>
                              </p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {cartItem && (
                                <>
                                  <button
                                    onClick={() => handleClientCartRemove(p.id)}
                                    className="w-4.5 h-4.5 bg-zinc-700 hover:bg-zinc-600 rounded flex items-center justify-center font-bold text-zinc-300 cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="w-5 text-center font-mono font-bold text-zinc-200 text-[10px]">
                                    {cartItem.quantity}
                                  </span>
                                </>
                              )}
                              <button
                                onClick={() => handleClientCartAdd(p.id)}
                                className="w-4.5 h-4.5 bg-amber-500 text-zinc-950 font-bold rounded flex items-center justify-center hover:bg-amber-400 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Cart checkout */}
                  {clientCart.length > 0 && (
                    <form onSubmit={submitClientOrder} className="mt-2.5 pt-2.5 border-t border-zinc-800 space-y-2 bg-zinc-950/80 p-2.5 rounded-lg shrink-0">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-[8px] uppercase font-mono tracking-wider text-zinc-400">Total a pagar:</span>
                        <span className="font-mono font-bold text-amber-500">
                          ${clientCart.reduce((sum, item) => sum + (MOBILE_CATALOG.find(p => p.id === item.productId)?.price || 0) * item.quantity, 0).toFixed(2)} M.N.
                        </span>
                      </div>

                      {/* Payment */}
                      <div className="grid grid-cols-2 gap-1.5 text-[8px]">
                        <button
                          type="button"
                          onClick={() => setClientPayment('contado')}
                          className={`py-1 rounded font-mono uppercase transition-all border ${
                            clientPayment === 'contado'
                              ? 'bg-amber-500 border-amber-600 text-zinc-950 font-bold'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                          }`}
                        >
                          Efectivo
                        </button>
                        <button
                          type="button"
                          onClick={() => setClientPayment('fiado')}
                          className={`py-1 rounded font-mono uppercase transition-all border ${
                            clientPayment === 'fiado'
                              ? 'bg-amber-500 border-amber-600 text-zinc-950 font-bold'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                          }`}
                        >
                          Pedir Fiado
                        </button>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold uppercase rounded text-[9px] tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <ShoppingBag className="w-3 h-3" />
                        Mandar Pedido en Espera
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* PHONE 2: PORTAL DE PRODUCTORES: LIBRETA DE QUESO */}
        {(!isolatedType || isolatedType === 'productor' || isolatedType === 'proveedor') && (
        <div className={!isolatedType ? "flex flex-col items-center bg-editorial-card/30 border border-editorial-border rounded-xl p-6 shadow-sm" : "w-full min-h-screen bg-black text-white flex flex-col"}>
          {!isolatedType && (
          <div className="text-center mb-4">
            <h3 className="text-xs font-mono uppercase tracking-widest font-bold text-editorial-text-primary mb-1">
              Dispositivo: Teléfono del Productor
            </h3>
            <p className="text-[10px] text-editorial-text-muted">Acceso individual seguro (Libreta de Queso)</p>
          </div>
          )}

          {/* Smartphone Shell Mockup */}
          <div className={!isolatedType ? "w-[335px] h-[610px] bg-zinc-950 border-[8px] border-zinc-800 rounded-[38px] overflow-hidden shadow-2xl relative flex flex-col font-sans select-none" : "flex-1 w-full bg-zinc-950 flex flex-col font-sans select-none"}>
            {/* Speaker & Camera Notch */}
            {!isolatedType && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-4.5 bg-zinc-800 rounded-b-xl z-20 flex justify-center items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-900 mr-2" />
              <div className="w-10 h-1 rounded-full bg-zinc-900" />
            </div>
            )}

            {/* Screen Content */}
            <div className={`flex-1 overflow-y-auto bg-slate-900 text-slate-100 flex flex-col text-xs ${!isolatedType ? 'p-4 pt-7' : 'px-4 py-6'}`}>
              
              {!loggedSupplier ? (
                /* PRODUCER PORTAL: LOCK / LOGIN SCREEN */
                <div className="flex-1 flex flex-col justify-between py-6">
                  <div className="text-center mt-6 space-y-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                      <Smartphone className="w-6 h-6 text-emerald-400" />
                    </div>
                    <h4 className="font-serif text-lg font-bold text-slate-100">Portal de Productores</h4>
                    <p className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest">Libreta de Queso</p>
                  </div>

                  <form onSubmit={handleSupplierLoginSubmit} className="space-y-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-slate-400 block">Cédula, Celular o Nombre:</label>
                      <input
                        type="text"
                        placeholder="Ej. 15082352, o Martín Niño"
                        value={supplierPhoneInput}
                        onChange={(e) => setSupplierPhoneInput(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-editorial-text-muted/70 block">PIN de Acceso (4 dígitos):</label>
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="••••"
                        value={supplierPinInput}
                        onChange={(e) => setSupplierPinInput(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono tracking-[0.5em] text-center"
                      />
                    </div>
                    
                    <button
                      type="submit"
                      className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold uppercase rounded text-[10px] tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Ingresar a mi Libreta
                    </button>

                    <div className="pt-2 border-t border-slate-800 text-center">
                      <span className="text-[8px] text-slate-500 block">Productores demo disponibles:</span>
                      <div className="flex flex-wrap gap-1 justify-center mt-1">
                        {suppliers.slice(0, 3).map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSupplierPhoneInput(s?.name || '')}
                            className="bg-slate-800 hover:bg-slate-700 text-[8px] text-slate-300 px-1.5 py-0.5 rounded transition-all"
                          >
                            {(s?.name || 'Productor').split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </form>

                  <div className="text-center text-[8px] text-slate-500 space-y-1">
                    <p>🔒 Sistema de Cuenta Corriente Cerrado</p>
                    <p>Kalu CRM S.A. de C.V.</p>
                  </div>
                </div>
              ) : (
                /* PRODUCER PORTAL: LOGGED IN */
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Internal Bar */}
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <div>
                        <p className="font-bold text-slate-100 leading-none">{loggedSupplier.name}</p>
                        <p className="text-[8px] text-slate-400 mt-0.5">Libreta de Queso Activa</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setLoggedSupplier(null);
                        setSupplierCart([]);
                      }}
                      className="p-1 text-slate-500 hover:text-slate-300 rounded"
                      title="Cerrar sesión"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>

                  {/* PRODUCER LEDGER (LIBRETA DE QUESO REAL-TIME) */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 mb-3.5 space-y-2">
                    <span className="text-[8px] uppercase font-mono tracking-wider text-slate-400 block font-bold">Resumen de Cuenta Corriente:</span>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2 text-center">
                        <span className="text-[7px] text-slate-400 uppercase block">Nos Deben</span>
                        <span className="font-mono text-emerald-400 font-bold text-xs">
                          ${loggedSupplier.balanceOwed.toFixed(2)}
                        </span>
                        <span className="text-[6.5px] text-slate-500 block leading-none mt-0.5">(Quesos Entregados)</span>
                      </div>

                      <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-2 text-center">
                        <span className="text-[7px] text-slate-400 uppercase block">Debo en Tienda</span>
                        <span className="font-mono text-rose-400 font-bold text-xs">
                          ${(loggedSupplier.storeDebt || 0).toFixed(2)}
                        </span>
                        <span className="text-[6.5px] text-slate-500 block leading-none mt-0.5">(Consumos / Moto)</span>
                      </div>
                    </div>

                    <div className="bg-slate-900/60 p-1.5 rounded text-[8.5px] font-mono text-slate-300 flex justify-between items-center">
                      <span>Saldo Neto a Cobrar:</span>
                      {(() => {
                        const net = loggedSupplier.balanceOwed - (loggedSupplier.storeDebt || 0);
                        return (
                          <span className={net >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {net >= 0 ? `$${net.toFixed(2)} M.N.` : `$${Math.abs(net).toFixed(2)} M.N. (Deuda)`}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {/* VIRTUAL STORE SEARCH & CATEGORIES */}
                  <div className="space-y-2 mb-3">
                    <div className="relative">
                      <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        placeholder="Pedir repuestos de moto, comida, víveres..."
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 pl-7 text-[10px] text-slate-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    {/* Category tabs */}
                    <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar text-[9px] font-mono">
                      {(['Todos', 'Repuestos', 'Comidas', 'Quesos'] as const).map(cat => (
                        <button
                          key={cat}
                          onClick={() => setSupplierCategory(cat)}
                          className={`px-2 py-1 rounded-full border transition-all shrink-0 ${
                            supplierCategory === cat
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Catalog display for Supplier */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                    {filteredSupplierProducts.length === 0 ? (
                      <p className="text-center text-[10px] text-slate-500 py-4 font-mono">No se encontraron productos</p>
                    ) : (
                      filteredSupplierProducts.map(p => {
                        const cartItem = supplierCart.find(item => item.productId === p.id);
                        return (
                          <div key={p.id} className="bg-slate-800/60 border border-slate-700/40 rounded-lg p-2 flex justify-between items-center transition-all">
                            <div>
                              <div className="flex items-center gap-1">
                                <span className={`px-1 py-0.2 rounded text-[7px] font-mono uppercase ${
                                  p.category === 'Repuestos' ? 'bg-sky-500/20 text-sky-400 font-bold' :
                                  p.category === 'Comidas' ? 'bg-amber-500/20 text-amber-400 font-bold' : 'bg-emerald-500/20 text-emerald-400 font-bold'
                                }`}>
                                  {p.category}
                                </span>
                                <p className="font-bold text-slate-200 text-[10.5px] max-w-[150px] truncate leading-tight">{p.name}</p>
                              </div>
                              <p className="text-[10px] text-emerald-400 font-mono mt-0.5">
                                ${p.price.toFixed(2)} <span className="text-slate-500 text-[8px]">/{p.unit}</span>
                              </p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {cartItem && (
                                <>
                                  <button
                                    onClick={() => handleSupplierCartRemove(p.id)}
                                    className="w-4.5 h-4.5 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center font-bold text-slate-300 cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="w-5 text-center font-mono font-bold text-slate-200 text-[10px]">
                                    {cartItem.quantity}
                                  </span>
                                </>
                              )}
                              <button
                                onClick={() => handleSupplierCartAdd(p.id)}
                                className="w-4.5 h-4.5 bg-emerald-500 text-slate-950 font-bold rounded flex items-center justify-center hover:bg-emerald-400 cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Cart checkout */}
                  {supplierCart.length > 0 && (
                    <form onSubmit={submitSupplierOrder} className="mt-2.5 pt-2.5 border-t border-slate-800 space-y-2 bg-slate-950/80 p-2.5 rounded-lg shrink-0">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-[8px] uppercase font-mono tracking-wider text-slate-400">Total Insumos:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          ${supplierCart.reduce((sum, item) => sum + (MOBILE_CATALOG.find(p => p.id === item.productId)?.price || 0) * item.quantity, 0).toFixed(2)} M.N.
                        </span>
                      </div>

                      {/* Payment */}
                      <div className="grid grid-cols-2 gap-1.5 text-[8px]">
                        <button
                          type="button"
                          onClick={() => setSupplierPayment('fiado')}
                          className={`py-1 rounded font-mono uppercase transition-all border ${
                            supplierPayment === 'fiado'
                              ? 'bg-emerald-500 border-emerald-600 text-slate-950 font-bold'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          Cargar a Libreta
                        </button>
                        <button
                          type="button"
                          onClick={() => setSupplierPayment('contado')}
                          className={`py-1 rounded font-mono uppercase transition-all border ${
                            supplierPayment === 'contado'
                              ? 'bg-emerald-500 border-emerald-600 text-slate-950 font-bold'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          Efectivo hoy
                        </button>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold uppercase rounded text-[9px] tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Truck className="w-3 h-3" />
                        Mandar a Libreta de Queso
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* PHONE 3: PORTAL EMPLEADO (DAISY) - CARGA DE FACTURAS */}
        {(!isolatedType || isolatedType === 'contador') && (
        <div className={!isolatedType ? "flex flex-col items-center bg-brand-accent/5 border border-brand-accent/20 rounded-xl p-6 shadow-sm" : "w-full min-h-screen bg-black text-white flex flex-col"}>
          {!isolatedType && (
          <div className="text-center mb-4">
            <h3 className="text-xs font-mono uppercase tracking-widest font-bold text-brand-accent mb-1">
              Dispositivo: Empleado (Daisy)
            </h3>
            <p className="text-[10px] text-editorial-text-muted">Carga Rápida mediante QR</p>
          </div>
          )}

          {/* Smartphone Shell Mockup */}
          <div className={!isolatedType ? "w-[335px] h-[610px] bg-zinc-950 border-[8px] border-zinc-800 rounded-[38px] overflow-hidden shadow-2xl relative flex flex-col font-sans select-none" : "flex-1 w-full bg-zinc-950 flex flex-col font-sans select-none"}>
            {/* Speaker & Camera Notch */}
            {!isolatedType && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-4.5 bg-zinc-800 rounded-b-xl z-20 flex justify-center items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-900 mr-2" />
              <div className="w-10 h-1 rounded-full bg-zinc-900" />
            </div>
            )}

            {/* Screen Content */}
            <div className={`flex-1 overflow-hidden bg-zinc-950 text-zinc-100 flex flex-col text-xs relative ${!isolatedType ? 'pt-7' : ''}`}>
              {!daisyScanned ? (
                <div className="flex-1 flex flex-col justify-center items-center p-6 text-center">
                  <div className="w-16 h-16 bg-brand-accent/20 rounded-full flex items-center justify-center mb-4 animate-pulse">
                    <QrCode className="w-8 h-8 text-brand-accent" />
                  </div>
                  <h4 className="text-lg font-bold text-zinc-100 mb-2">Escanear QR de Área</h4>
                  <p className="text-xs text-zinc-400 mb-8">Punto de Carga de Facturas y Control de Costos</p>
                  
                  <button 
                    onClick={() => setDaisyScanned(true)}
                    className="w-full py-3 bg-brand-accent hover:bg-amber-400 text-zinc-950 font-bold uppercase rounded-xl text-xs tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-brand-accent/20"
                  >
                    <Scan className="w-4 h-4" />
                    Simular Escaneo QR
                  </button>
                </div>
              ) : (
                <div className="absolute inset-0 pt-7">
                  <InvoiceUploadView onBack={() => setDaisyScanned(false)} />
                </div>
              )}
            </div>
          </div>
        </div>
        )}

      </div>

      {/* CASHIER MOBILE ORDER DESK RECEIVER */}
      {!isolatedType && (
      <div className="bg-editorial-card border border-editorial-border rounded-lg p-6 space-y-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-editorial-border/60 pb-4">
          <div className="flex items-center gap-2.5">
            <Clock className="text-amber-500 w-5 h-5" />
            <div>
              <h3 className="font-serif text-lg font-bold text-editorial-text-primary">
                Mesa de Recepción de Pedidos Móviles (Cajero en CRM)
              </h3>
              <p className="text-[10px] font-mono uppercase tracking-wider text-editorial-text-muted mt-0.5">
                Cola en tiempo real de pedidos enviados desde celulares
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded text-[10px] font-mono font-bold uppercase">
            {mobileOrders.filter(o => o.status === 'Pendiente').length} Pedidos Pendientes
          </span>
        </div>

        {mobileOrders.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-editorial-border/50 rounded-lg">
            <Smartphone className="w-8 h-8 text-editorial-text-muted/40 mx-auto mb-2" />
            <p className="text-xs text-editorial-text-muted font-mono uppercase">No hay pedidos entrantes en este momento</p>
            <p className="text-[10px] text-editorial-text-muted/60 mt-1">Utiliza los teléfonos de arriba para iniciar sesión en una cuenta, buscar repuestos o comidas y mandar un pedido.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {mobileOrders.map((order) => (
              <div
                key={order.id}
                className={`border rounded-lg p-4 transition-all ${
                  order.status === 'Pendiente'
                    ? 'border-amber-500/30 bg-amber-500/[0.01]'
                    : order.status === 'Entregado'
                    ? 'border-editorial-border/60 bg-editorial-bg opacity-75'
                    : 'border-editorial-border/30 bg-editorial-bg/30 opacity-50 line-through'
                }`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-editorial-text-primary">
                        {order.id}
                      </span>
                      <span className={`px-1.5 py-0.5 text-[8px] font-mono uppercase font-bold rounded ${
                        order.type === 'client'
                          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {order.type === 'client' ? 'Cliente Normal (Quesos/Repuestos/Comida)' : 'Productor (Insumos/Libreta)'}
                      </span>
                      <span className="text-[10px] text-editorial-text-muted font-mono">
                        {order.date}
                      </span>
                    </div>

                    <div className="font-sans text-xs font-semibold text-editorial-text-primary">
                      Destinatario: <span className="underline">{order.entityName}</span>
                    </div>

                    <div className="text-[10px] text-editorial-text-muted font-mono">
                      Forma de Pago solicitada: <span className="uppercase text-editorial-text-primary font-semibold">{order.paymentMethod === 'fiado' ? 'Fiado / Cargo a Libreta' : 'Contado (Efectivo)'}</span>
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <div className="text-xs font-mono text-editorial-text-muted">Total:</div>
                    <div className="text-sm font-mono font-bold text-editorial-text-primary">
                      ${(order.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} M.N.
                    </div>
                    <div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase font-bold inline-block ${
                        order.status === 'Pendiente'
                          ? 'bg-amber-500 text-white animate-pulse'
                          : order.status === 'Entregado'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-500'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Items listing */}
                <div className="mt-3 pt-3 border-t border-editorial-border/40 text-xs">
                  <span className="text-[9px] font-mono uppercase text-editorial-text-muted block mb-1">Detalle del Pedido:</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between border-b border-editorial-border/20 pb-0.5 text-editorial-text-primary/90">
                        <span>• {item.name} (x{item.quantity})</span>
                        <span>${item.subtotal.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dispatch actions for cashier */}
                {order.status === 'Pendiente' && (
                  <div className="mt-4 pt-3 border-t border-editorial-border/30 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`¿Deseas cancelar y rechazar el pedido ${order.id}?`)) {
                          onCancelMobileOrder(order.id);
                        }
                      }}
                      className="px-3 py-1.5 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-[10px] font-mono uppercase font-bold rounded cursor-pointer transition-all"
                    >
                      Rechazar Pedido
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDeliverMobileOrder(order.id);
                      }}
                      className="px-4 py-1.5 bg-emerald-500 hover:brightness-110 text-white border border-emerald-600 text-[10px] font-mono uppercase font-bold rounded cursor-pointer transition-all flex items-center gap-1 shadow-md"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Entregar, Despachar &amp; Registrar Libreta
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
