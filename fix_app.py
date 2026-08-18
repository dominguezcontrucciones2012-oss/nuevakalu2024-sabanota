import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Merge salesState and old transactions
old_prop = "salesHistory={salesState}"
new_prop = """salesHistory={[
                ...salesState,
                ...transactions.filter(t => 
                  t.category === 'ventas' && 
                  !salesState.some(s => s.date.includes(t.date) && s.total === t.amount)
                )
              ].map(t => ({
                id: t.id,
                date: t.date,
                clientName: t.clientName || t.entity || 'Histórico',
                items: t.items || [],
                paymentMethod: t.paymentMethod || t.method || 'N/A',
                total: t.total || t.amount || 0,
                debtAmount: t.debtAmount || 0,
                paidAmount: t.paidAmount || t.amount || 0,
                exchangeRate: t.exchangeRate || 45.00
              }))}"""

content = content.replace(old_prop, new_prop)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated App.tsx with merged history")
