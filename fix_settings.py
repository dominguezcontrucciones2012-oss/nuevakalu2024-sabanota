import re

with open('src/components/SettingsAdminView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add state
old_state = 'const [businessName, setBusinessName] = useState(settings.businessName);'
new_state = 'const [businessName, setBusinessName] = useState(settings.businessName);\n  const [exchangeRate, setExchangeRate] = useState(settings.exchangeRate || 45.00);'
content = content.replace(old_state, new_state)

# Add to handleSaveConfig
old_save = 'onUpdateSettings({\n      businessName,\n      taxRate,\n      defaultStartingCash,\n      emergencyAlertMode\n    });'
new_save = 'onUpdateSettings({\n      businessName,\n      taxRate,\n      defaultStartingCash,\n      emergencyAlertMode,\n      exchangeRate\n    });'
content = content.replace(old_save, new_save)

# Add UI field
old_ui = """                  <div className="space-y-1">
                    <label className="font-mono text-xs text-editorial-text-muted uppercase">IVA / Impuesto (%)</label>
                    <input
                      type="number"
                      value={taxRate}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded-none text-sm text-editorial-text-primary focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>"""

new_ui = """                  <div className="space-y-1">
                    <label className="font-mono text-xs text-editorial-text-muted uppercase">IVA / Impuesto (%)</label>
                    <input
                      type="number"
                      value={taxRate}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-full h-10 px-3 bg-editorial-bg border border-editorial-border rounded-none text-sm text-editorial-text-primary focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  
                  <div className="space-y-1 mt-6">
                    <label className="font-mono text-xs text-amber-500 font-bold uppercase">Tasa Oficial de Cambio (Bs/$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 1)}
                      className="w-full h-10 px-3 bg-amber-500/10 border border-amber-500/50 rounded-none text-sm text-amber-500 font-bold focus:outline-none focus:border-amber-500 font-mono"
                    />
                    <p className="text-[10px] text-editorial-text-muted">Esta tasa regirá en todo el Punto de Venta y Cobranzas.</p>
                  </div>"""

content = content.replace(old_ui, new_ui)

with open('src/components/SettingsAdminView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated SettingsAdminView.tsx')
