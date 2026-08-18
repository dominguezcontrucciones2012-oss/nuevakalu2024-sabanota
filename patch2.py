with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

app = app.replace('sales={salesState}', 'sales={transactions.filter(t => t.category === "ventas")}')

if 'const handleProcessSale = async (' not in app:
    app = app.replace('const handleProcessSale = (', 'const handleProcessSale = async (')

if 'onProcessSale={async (sale) =>' not in app:
    app = app.replace('onProcessSale={(sale) =>', 'onProcessSale={async (sale) =>')

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
