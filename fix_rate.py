import re

with open('src/components/CheesePOSView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Props
content = content.replace('interface CheesePOSViewProps {', 'interface CheesePOSViewProps {\n  exchangeRate: number;')

# 2. Update Component Args
content = content.replace('function CheesePOSViewInner({\n  products,', 'function CheesePOSViewInner({\n  exchangeRate,\n  products,')

# 3. Remove internal state
old_state = """  const [exchangeRate, setExchangeRate] = useState<number>(() => {
    const saved = localStorage.getItem('kalu_tasa_cambio');
    return saved ? parseFloat(saved) : 45.00;
  });"""
content = content.replace(old_state, "")

# 4. Update UI in Modal
old_ui = """                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-editorial-text-muted uppercase">Tasa (Bs/$):</span>
                  <input 
                    type="number" 
                    value={exchangeRate}
                    step="0.01"
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 1;
                      setExchangeRate(val);
                      localStorage.setItem('kalu_tasa_cambio', val.toString());
                    }}
                    className="w-24 h-9 px-2 bg-editorial-bg border border-editorial-border text-editorial-text-primary text-center font-mono font-bold focus:outline-none focus:border-amber-500 rounded-none"
                  />
                </div>"""

new_ui = """                <div className="flex items-center gap-2 px-3 py-1.5 bg-editorial-bg border border-amber-500/30">
                  <span className="font-mono text-xs text-amber-500 font-bold uppercase tracking-wider">TASA OFICIAL: {exchangeRate.toFixed(2)} Bs/$</span>
                </div>"""
content = content.replace(old_ui, new_ui)

with open('src/components/CheesePOSView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('POS view updated for global exchange rate')
