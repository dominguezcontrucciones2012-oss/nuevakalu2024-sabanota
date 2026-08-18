import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add addDoc import
content = content.replace(
    "import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';",
    "import { collection, onSnapshot, doc, setDoc, updateDoc, addDoc } from 'firebase/firestore';"
)

# 2. Update CheesePOSView prop to pass notes and total
old_prop = """              onProcessSale={(sale) =>
                handleProcessSale(
                  sale.items,
                  sale.client?.id || undefined,
                  sale.paymentMethod,
                  sale.supplier?.id || undefined,
                  sale.paidAmount
                )
              }"""

new_prop = """              onProcessSale={(sale) =>
                handleProcessSale(
                  sale.items,
                  sale.client?.id || undefined,
                  sale.paymentMethod,
                  sale.supplier?.id || undefined,
                  sale.paidAmount,
                  sale.notes,
                  sale.total
                )
              }"""
content = content.replace(old_prop, new_prop)

# 3. Completely rewrite handleProcessSale
old_func = """  const handleProcessSale = (
    saleItems: any[],
    clientId?: string,
    paymentMethodType?: string,
    supplierId?: string,
    paidAmount?: number
  ) => {
    const saleTotal = saleItems.reduce((sum, item) => sum + item.subtotal, 0);
    const amountPaid = paidAmount !== undefined ? paidAmount : saleTotal;
    const debtAmount = Math.max(0, saleTotal - amountPaid);

    // Decrease product stock
    setCheeseProducts((prevProducts) =>
      prevProducts.map((p) => {
        const item = saleItems.find((si) => si.productId === p.id);
        if (item) {
          const newStock = Math.max(0, p.stockKg - item.quantityKg);
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
            if (paymentMethodType === 'credit' || paymentMethodType === 'Libreta de Queso') {
              return {
                ...c,
                outstandingDebt: c.outstandingDebt + debtAmount,
                loyaltyPoints: c.loyaltyPoints + addedPoints
              };
            } else {
              return {
                ...c,
                loyaltyPoints: c.loyaltyPoints + addedPoints
              };
            }
          }
          return c;
        })
      );

      if ((paymentMethodType === 'credit' || paymentMethodType === 'Libreta de Queso') && debtAmount > 0) {
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
            const currentDebt = s.storeDebt || 0;
            return {
              ...s,
              storeDebt: currentDebt + debtAmount
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
      }
    }

    // Update global finance values (add the cash portion to liquid balance)
    setBalance((prev) => prev + amountPaid);
    setTotalSalesRevenue((prev) => prev + saleTotal);
    setTotalSalesCount((prev) => prev + 1);

    // Add general transaction record
    const newTx: Transaction = {
      id: `TX-${Date.now().toString().slice(-4)}`,
      entity: customerName,
      category: 'ventas',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: `F-${Math.floor(Math.random() * 9000 + 1000)}`,
      amount: saleTotal,
      isIncome: true,
      status: 'Completado'
    };
    setTransactions((prev) => [newTx, ...prev]);

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
  };"""

new_func = """  const handleProcessSale = async (
    saleItems: any[],
    clientId?: string,
    paymentMethodType?: string,
    supplierId?: string,
    paidAmount?: number,
    notes?: string,
    totalParam?: number
  ) => {
    const saleTotal = totalParam !== undefined ? totalParam : saleItems.reduce((sum, item) => sum + item.subtotal, 0);
    const amountPaid = paidAmount !== undefined ? paidAmount : saleTotal;
    const debtAmount = Math.max(0, saleTotal - amountPaid);
    
    let customerName = 'Cliente General';
    let selectedClient = null;
    let selectedSup = null;

    if (clientId) {
      selectedClient = clients.find(c => c.id === clientId);
      if (selectedClient) customerName = selectedClient.name;
    } else if (supplierId) {
      selectedSup = suppliers.find(s => s.id === supplierId);
      if (selectedSup) customerName = `${selectedSup.name} (Productor)`;
    }

    try {
      // 1. DEDUCT PRODUCT STOCK IN FIRESTORE
      for (const item of saleItems) {
        const prod = cheeseProducts.find(p => p.id === item.productId);
        if (prod) {
          const newStock = Math.max(0, prod.stockKg - item.quantityKg);
          await updateDoc(doc(db, 'products', prod.id), { stockKg: newStock });
        }
      }

      // 2. UPDATE CLIENT OR SUPPLIER DEBT
      if (debtAmount > 0) {
        if (clientId && selectedClient) {
          const newDebt = (selectedClient.outstandingDebt || 0) + debtAmount;
          await updateDoc(doc(db, 'clients', clientId), { outstandingDebt: newDebt });
        } else if (supplierId && selectedSup) {
          const newDebt = (selectedSup.storeDebt || 0) + debtAmount;
          await updateDoc(doc(db, 'suppliers', supplierId), { storeDebt: newDebt });
        }
      }

      const txId = `TX-${Date.now().toString().slice(-6)}`;
      const dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // 3. CREATE FULL SALE RECEIPT IN 'sales'
      const saleDoc = {
        id: txId,
        date: `${dateStr} ${timeStr}`,
        clientName: customerName,
        clientId: clientId || null,
        supplierId: supplierId || null,
        items: saleItems,
        total: saleTotal,
        paymentMethod: paymentMethodType || 'Efectivo',
        notes: notes || '',
        paidAmount: amountPaid,
        debtAmount: debtAmount,
        exchangeRate: settings.exchangeRate || 45.00
      };
      await addDoc(collection(db, 'sales'), saleDoc);

      // 4. CREATE ACCOUNTING TRANSACTION IN 'transactions'
      const newTx: any = {
        entity: customerName,
        category: 'ventas',
        date: dateStr,
        invoiceNumber: `F-${Math.floor(Math.random() * 9000 + 1000)}`,
        amount: saleTotal,
        isIncome: true,
        status: 'Completado',
        method: paymentMethodType || 'Efectivo',
        ref: notes || ''
      };
      await addDoc(collection(db, 'transactions'), newTx);

      addNotification('Venta procesada y guardada en la Nube correctamente', 'success');
    } catch (error) {
      console.error("Error guardando la venta en Firestore:", error);
      addNotification('Error crítico al conectar con la base de datos', 'warning');
      return; // Do not update local state if DB fails
    }

    // 5. UPDATE LOCAL MEMORY (Reactive immediate update)
    setCheeseProducts((prevProducts) =>
      prevProducts.map((p) => {
        const item = saleItems.find((si) => si.productId === p.id);
        if (item) {
          const newStock = Math.max(0, p.stockKg - item.quantityKg);
          return { ...p, stockKg: newStock };
        }
        return p;
      })
    );

    if (clientId && selectedClient) {
      setClients((prevClients) =>
        prevClients.map((c) => {
          if (c.id === clientId) {
            const addedPoints = Math.round(saleTotal * 0.1);
            return {
              ...c,
              outstandingDebt: c.outstandingDebt + debtAmount,
              loyaltyPoints: c.loyaltyPoints + addedPoints
            };
          }
          return c;
        })
      );
    } else if (supplierId && selectedSup) {
      setSuppliers((prevSuppliers) =>
        prevSuppliers.map((s) => {
          if (s.id === supplierId) {
            return { ...s, storeDebt: (s.storeDebt || 0) + debtAmount };
          }
          return s;
        })
      );
    }

    setBalance((prev) => prev + amountPaid);
    setTotalSalesRevenue((prev) => prev + saleTotal);
    setTotalSalesCount((prev) => prev + 1);

    const newTxLocal: Transaction = {
      id: `TX-${Date.now().toString().slice(-4)}`,
      entity: customerName,
      category: 'ventas',
      date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceNumber: `F-${Math.floor(Math.random() * 9000 + 1000)}`,
      amount: saleTotal,
      isIncome: true,
      status: 'Completado'
    };
    setTransactions((prev) => [newTxLocal, ...prev]);
  };"""

content = content.replace(old_func, new_func)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated handleProcessSale")
