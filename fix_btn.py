with open('src/components/CheesePOSView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'onClick={() => setLastReceipt(s)}',
    "onClick={() => { setLastReceipt(s); setActiveTab('pos'); }}"
)

with open('src/components/CheesePOSView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated onClick')
