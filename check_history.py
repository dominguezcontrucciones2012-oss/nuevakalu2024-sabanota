with open('src/components/CheesePOSView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

idx_start = content.find("activeTab === 'history' && (")
idx_end = content.find("activeTab === 'closing' && (", idx_start)
print(content[idx_start:idx_end])
