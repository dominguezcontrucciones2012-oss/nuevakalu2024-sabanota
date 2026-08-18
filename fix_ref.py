import re

with open('src/components/CheesePOSView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace paidAmount with actualPaidAmount
old_code = """    onProcessSale({
      client,
      supplier,
      items: cart,
      paymentMethod: finalPaymentMethod, notes: refDetails,
      total,
      paidAmount
    });"""

new_code = """    onProcessSale({
      client,
      supplier,
      items: cart,
      paymentMethod: finalPaymentMethod, notes: refDetails,
      total,
      paidAmount: actualPaidAmount
    });"""
content = content.replace(old_code, new_code)

old_receipt = """      paidAmount,
      debtAmount,
      exchangeRate"""
new_receipt = """      paidAmount: actualPaidAmount,
      debtAmount,
      exchangeRate"""
content = content.replace(old_receipt, new_receipt)

with open('src/components/CheesePOSView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed paidAmount reference error')
