with open('src/components/CheesePOSView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find('{lastReceipt && (')
idx2 = content.find("activeTab === 'history'")
print(f'lastReceipt index: {idx}')
print(f'history index: {idx2}')
