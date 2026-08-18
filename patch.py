import re

with open('src/types.ts', 'r', encoding='utf-8') as f:
    types = f.read()

types = types.replace(
    '  idNumber?: string;',
    '  idNumber?: string;\n  rfc?: string;\n  isCheeseProducer?: boolean;'
)
types = types.replace(
    '  storeName: string;',
    '  storeName: string;\n  exchangeRate?: number;'
)
with open('src/types.ts', 'w', encoding='utf-8') as f:
    f.write(types)


with open('src/components/CheeseInventoryView.tsx', 'r', encoding='utf-8') as f:
    civ = f.read()
civ = civ.replace('{displayUnit}', "{p.unit || 'Kg'}")
with open('src/components/CheeseInventoryView.tsx', 'w', encoding='utf-8') as f:
    f.write(civ)


with open('src/components/ClientsCreditView.tsx', 'r', encoding='utf-8') as f:
    ccv = f.read()

if 'import { Eye,' not in ccv:
    ccv = ccv.replace('import { Search, Plus, Phone,', 'import { Search, Plus, Phone, Eye, Clock, X,')

ccv = ccv.replace('exchangeRate: number;', 'exchangeRate?: number;')
ccv = ccv.replace('salesHistory: any[];', 'salesHistory?: any[];')
ccv = ccv.replace('const [exchangeRate] = useState(42.50);', 'const exchangeRate = 42.50;')
with open('src/components/ClientsCreditView.tsx', 'w', encoding='utf-8') as f:
    f.write(ccv)


with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

import_block = "import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';\nimport { db } from './services/firebase';\nimport { doc, updateDoc, increment, collection, onSnapshot, query, setDoc, deleteDoc } from 'firebase/firestore';"

app = app.replace("import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';", import_block)

app = re.sub(r'const handleRecordStockAdjustment = async.*?};', '', app, count=1, flags=re.DOTALL)

app = app.replace(
    '''            <DashboardView
              transactions={transactions}
              balance={balance}
              cheeseProducts={cheeseProducts}
              clients={clients}
              suppliers={suppliers}
              onNavigate={setCurrentView}
              onAddNotification={(msg) => addNotification(msg, 'info')}
            />''',
    '''            <DashboardView
              transactions={transactions}
              balance={balance}
              cheeseProducts={cheeseProducts}
              clients={clients}
              suppliers={suppliers}
              onNavigate={setCurrentView}
              onAddNotification={(msg) => addNotification(msg, 'info')}
              settings={settings}
              expenses={expenses}
              sales={salesState}
            />'''
)

app = app.replace(
    "onAddProduct={(prod: Omit<CheeseProduct, 'id'>) => {",
    "onAddProduct={async (prod: Omit<CheeseProduct, 'id'>) => {"
)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
