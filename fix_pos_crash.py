import re

with open('src/components/CheesePOSView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# I need to move:
#   // Calculate Cart Totals
#   const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
#   const tax = subtotal * 0.16; // 16% IVA
#   const total = subtotal + tax;
# To ABOVE the real-time calculations.

cart_totals_block = """  // Calculate Cart Totals
  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const tax = subtotal * 0.16; // 16% IVA
  const total = subtotal + tax;"""

if cart_totals_block in content:
    content = content.replace(cart_totals_block, '')
    
    # insert before Real-time calculations
    insert_target = "// Real-time calculations"
    content = content.replace(insert_target, cart_totals_block + "\n\n  " + insert_target)

with open('src/components/CheesePOSView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed total ReferenceError')
