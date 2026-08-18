with open('src/components/CheesePOSView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

idx_pos = content.find("activeTab === 'pos' && (")
print(f'pos tab content starts at: {idx_pos}')

idx_history = content.find("activeTab === 'history' && (")
print(f'history tab content starts at: {idx_history}')

idx_last = content.find('{lastReceipt && (')
print(f'lastReceipt block starts at: {idx_last}')
