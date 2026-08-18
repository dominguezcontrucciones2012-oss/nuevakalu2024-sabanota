import re

with open('src/components/CheesePOSView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove rounded
content = re.sub(r'\brounded-md\b', 'rounded-none', content)
content = re.sub(r'\brounded-lg\b', 'rounded-none', content)
content = re.sub(r'\brounded-xl\b', 'rounded-none', content)
content = re.sub(r'\brounded-full\b', 'rounded-none', content)
content = re.sub(r'\brounded\b', 'rounded-none', content)

# 2. Change colors
content = re.sub(r'\bemerald-\d+\b', 'amber-500', content)
content = re.sub(r'\bgreen-\d+\b', 'amber-500', content)
content = re.sub(r'\borange-\d+\b', 'amber-500', content)

# 3. Change General toggle
content = content.replace("{ type: 'general', label: 'General' },", "")
content = content.replace("'general' | 'client' | 'supplier'", "'client' | 'supplier'")
content = content.replace("useState<'client' | 'supplier'>('general')", "useState<'client' | 'supplier'>('client')")

# 4. Change Title
content = content.replace("Punto de Venta", "CAJA REGISTRADORA")

with open('src/components/CheesePOSView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Refactored rounded and colors')
