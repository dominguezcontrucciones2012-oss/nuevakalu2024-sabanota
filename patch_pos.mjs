import fs from 'fs';

let content = fs.readFileSync('src/components/CheesePOSView.tsx', 'utf8');

content = content.replace('Smartphone, Zap } from \'lucide-react\'', 'Smartphone, Zap, X } from \'lucide-react\'');
// 1. Inject state
content = content.replace(
  'const [lastReceipt, setLastReceipt] = useState<any | null>(null);',
  `const [lastReceipt, setLastReceipt] = useState<any | null>(null);
  const [isPaymentHubOpen, setIsPaymentHubOpen] = useState(false);
  const [printReceipt, setPrintReceipt] = useState(true);`
);

// 2. Remove the old payment method section
const paymentRegex = /\{\/\* Payment Method Select \*\/\}.*?\{\/\* Split Credit \/ Libreta input \*\/\}.*?\)\}/s;
content = content.replace(paymentRegex, '');

// 3. Change "Registrar y Procesar Venta" button to open the Drawer instead of submitting
const buttonRegex = /<button[\s\S]*?Registrar y Procesar Venta[\s\S]*?<\/button>/;
const newButton = `<button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => setIsPaymentHubOpen(true)}
                  className="w-full h-12 bg-amber-500 text-editorial-bg font-serif font-bold text-md tracking-tight flex items-center justify-center gap-2 hover:brightness-110 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded-none border border-amber-600"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Procesar Pago</span>
                </button>`;
content = content.replace(buttonRegex, newButton);

// 4. Update the form to not submit natively, or just remove onSubmit (already changed button to type="button")
content = content.replace('<form onSubmit={handleProcessSaleSubmit} className="space-y-4">', '<div className="space-y-4">');
content = content.replace('</form>', '</div>');

// 5. Inject the Smart Payment Hub Drawer at the end, right before the last closing </div>
const hubDrawer = `
      {/* SMART PAYMENT HUB DRAWER */}
      {isPaymentHubOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-editorial-bg/80 backdrop-blur-sm" onClick={() => setIsPaymentHubOpen(false)} />
          <div className="relative w-[400px] h-full bg-editorial-card border-l border-editorial-border shadow-2xl flex flex-col p-6 animate-slide-left rounded-none">
            
            <div className="flex justify-between items-center mb-8 border-b border-editorial-border/40 pb-4">
              <h2 className="font-serif text-2xl font-black text-editorial-text-primary uppercase tracking-tight">Smart Payment</h2>
              <button onClick={() => setIsPaymentHubOpen(false)} className="text-editorial-text-muted hover:text-amber-500 transition-colors cursor-pointer rounded-none border border-transparent p-1">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto">
              <div className="bg-editorial-bg border border-amber-500/50 p-6 flex flex-col items-center justify-center rounded-none shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                <span className="font-mono text-xs text-editorial-text-muted uppercase tracking-widest mb-2">Total a Cobrar</span>
                <span className="font-serif text-5xl font-black text-amber-500">$\{total.toFixed(2)}</span>
              </div>

              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase text-editorial-text-muted tracking-wider">Método de Pago</label>
                <div className="grid grid-cols-2 gap-2">
                  {(() => {
                    const methods = ['Efectivo', 'Tarjeta', 'Transferencia'];
                    if (customerType === 'client') methods.push('credit');
                    else if (customerType === 'supplier') methods.push('Libreta de Queso');
                    return methods.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(m);
                          setPaidAmountInput('');
                        }}
                        className={\`py-3 text-[11px] font-mono font-bold uppercase border transition-all cursor-pointer rounded-none \${
                          paymentMethod === m
                            ? 'bg-amber-500 border-amber-600 text-editorial-bg shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                            : 'bg-editorial-bg border-editorial-border text-editorial-text-muted hover:text-amber-500 hover:border-amber-500/50'
                        }\`}
                      >
                        {m === 'credit' ? 'Crédito' : m}
                      </button>
                    ));
                  })()}
                </div>
              </div>

              {(paymentMethod === 'Efectivo' || paymentMethod === 'credit' || paymentMethod === 'Libreta de Queso') && (
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase text-editorial-text-muted tracking-wider">
                    {paymentMethod === 'Efectivo' ? 'Efectivo Recibido' : 'Abono en Efectivo (0 para cargar todo)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paidAmountInput}
                    onChange={(e) => setPaidAmountInput(e.target.value)}
                    placeholder={\`\${total.toFixed(2)}\`}
                    className="w-full h-14 px-4 bg-editorial-bg border-2 border-amber-500 text-xl text-editorial-text-primary focus:outline-none focus:border-amber-400 font-mono text-center rounded-none shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]"
                  />
                  {paymentMethod === 'Efectivo' && (
                    <div className="flex justify-between items-center pt-2 px-1">
                      <span className="font-mono text-xs text-editorial-text-muted uppercase">Vuelto a entregar:</span>
                      <span className="font-mono text-lg font-bold text-amber-500">
                        $\{Math.max(0, (parseFloat(paidAmountInput) || 0) - total).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {(paymentMethod === 'credit' || paymentMethod === 'Libreta de Queso') && (
                    <div className="flex justify-between items-center pt-2 px-1">
                      <span className="font-mono text-xs text-editorial-text-muted uppercase">Deuda a Cargar:</span>
                      <span className="font-mono text-lg font-bold text-amber-500">
                        $\{Math.max(0, total - (parseFloat(paidAmountInput) || 0)).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
              
              <div className="flex items-center gap-3 py-4 border-y border-editorial-border/30">
                <input 
                  type="checkbox" 
                  checked={printReceipt} 
                  onChange={(e) => setPrintReceipt(e.target.checked)}
                  className="w-5 h-5 accent-amber-500 rounded-none cursor-pointer"
                />
                <span className="font-mono text-xs uppercase text-editorial-text-primary tracking-wider">Imprimir Ticket Automáticamente</span>
              </div>
            </div>

            <div className="pt-6 mt-auto">
              <button
                onClick={(e) => {
                  handleProcessSaleSubmit(e as any);
                  setIsPaymentHubOpen(false);
                  if (printReceipt) {
                    setTimeout(() => window.print(), 300);
                  }
                }}
                className="w-full h-14 bg-amber-500 text-editorial-bg font-serif font-black text-xl tracking-widest flex items-center justify-center uppercase hover:bg-amber-400 active:scale-95 transition-all cursor-pointer rounded-none border border-amber-600 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
              >
                Procesar Venta
              </button>
            </div>
          </div>
        </div>
      )}
`;

content = content.replace('    </div>\n  );\n}\n', hubDrawer + '\n    </div>\n  );\n}\n');

fs.writeFileSync('src/components/CheesePOSView.tsx', content, 'utf8');
console.log('CheesePOSView patched for Smart Payment Hub!');
