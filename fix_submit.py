import re

with open('src/components/CheesePOSView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Change handleProcessSaleSubmit to return boolean
content = content.replace('const handleProcessSaleSubmit = (e: React.FormEvent) => {', 'const handleProcessSaleSubmit = (e: React.FormEvent): boolean => {')

content = content.replace('if (!isMultipagoValid()) return;', 'if (!isMultipagoValid()) return false;')

old_validation = """    if (customerType === 'client' && !selectedClientId) {
      onAddNotification('Por favor, seleccione un cliente.', 'warning');
      return;
    }
    if (customerType === 'supplier' && !selectedSupplierId) {
      onAddNotification('Por favor, seleccione un productor.', 'warning');
      return;
    }"""
new_validation = """    if (customerType === 'client' && !selectedClientId) {
      onAddNotification('Por favor, seleccione un cliente.', 'warning');
      return false;
    }
    if (customerType === 'supplier' && !selectedSupplierId) {
      onAddNotification('Por favor, seleccione un productor.', 'warning');
      return false;
    }"""
content = content.replace(old_validation, new_validation)


old_end = """    setLastReceipt(receipt);
    setCart([]);
    setSelectedClientId('');
    setSelectedSupplierId('');
    setPaymentMethod('Efectivo');
    setPaidAmountInput('');
  };"""
new_end = """    setLastReceipt(receipt);
    setCart([]);
    setSelectedClientId('');
    setSelectedSupplierId('');
    setPaymentMethod('Efectivo');
    setPaidAmountInput('');
    return true;
  };"""
content = content.replace(old_end, new_end)

# 2. Fix the onClick of the PROCESAR VENTA button
old_button = """                    handleProcessSaleSubmit(e as any);
                    setIsPaymentHubOpen(false);
                    
                    // Show print prompt
                    setPrintPromptReceipt(true);

                    // Reset inputs
                    setPayCashUsd(''); setPayCashBs(''); setPayPagoMovil(''); setRefPagoMovil('');
                    setPayPos(''); setRefPos(''); setPayBiopago(''); setRefBiopago(''); setAcceptDebt(false);"""

new_button = """                    const success = handleProcessSaleSubmit(e as any);
                    if (success) {
                      setIsPaymentHubOpen(false);
                      setPrintPromptReceipt(true);
                      setPayCashUsd(''); setPayCashBs(''); setPayPagoMovil(''); setRefPagoMovil('');
                      setPayPos(''); setRefPos(''); setPayBiopago(''); setRefBiopago(''); setAcceptDebt(false);
                    }"""
content = content.replace(old_button, new_button)

with open('src/components/CheesePOSView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed submit handler logic')
