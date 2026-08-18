import re

with open('src/components/CheesePOSView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove printReceipt state
content = content.replace("const [printReceipt, setPrintReceipt] = useState(true);", 
"""const [printReceipt, setPrintReceipt] = useState(true);
  const [printPromptReceipt, setPrintPromptReceipt] = useState<any | null>(null);""")

# 2. Modify submit handler to just show notifications and not be disabled
old_submit = """                <button
                  onClick={(e) => {
                    handleProcessSaleSubmit(e as any);
                    setIsPaymentHubOpen(false);
                    // Reset inputs
                    setPayCashUsd(''); setPayCashBs(''); setPayPagoMovil(''); setRefPagoMovil('');
                    setPayPos(''); setRefPos(''); setPayBiopago(''); setRefBiopago(''); setAcceptDebt(false);
                    if (printReceipt) setTimeout(() => window.print(), 300);
                  }}
                  disabled={!isMultipagoValid()}
                  className="px-10 h-14 bg-amber-500 text-editorial-bg font-serif font-black text-xl tracking-widest uppercase hover:bg-amber-400 active:scale-95 transition-all cursor-pointer rounded-none border border-amber-600 disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                >
                  PROCESAR VENTA
                </button>"""

new_submit = """                <button
                  onClick={(e) => {
                    if (cart.length === 0) {
                      onAddNotification('El carrito está vacío', 'warning'); return;
                    }
                    if (parseFloat(payPagoMovil) > 0 && !refPagoMovil.trim()) {
                      onAddNotification('Falta Referencia de Pago Móvil', 'warning'); return;
                    }
                    if (parseFloat(payPos) > 0 && !refPos.trim()) {
                      onAddNotification('Falta Aprobación de Punto de Venta', 'warning'); return;
                    }
                    if (parseFloat(payBiopago) > 0 && !refBiopago.trim()) {
                      onAddNotification('Falta Referencia de Biopago', 'warning'); return;
                    }
                    if (remainingUsd > 0.01 && !acceptDebt) {
                      onAddNotification('Falta dinero para completar la venta. Haga clic en Cargar a Deuda.', 'warning'); return;
                    }
                    
                    handleProcessSaleSubmit(e as any);
                    setIsPaymentHubOpen(false);
                    
                    // Show print prompt
                    setPrintPromptReceipt(true);

                    // Reset inputs
                    setPayCashUsd(''); setPayCashBs(''); setPayPagoMovil(''); setRefPagoMovil('');
                    setPayPos(''); setRefPos(''); setPayBiopago(''); setRefBiopago(''); setAcceptDebt(false);
                  }}
                  className="px-10 h-14 bg-amber-500 text-editorial-bg font-serif font-black text-xl tracking-widest uppercase hover:bg-amber-400 active:scale-95 transition-all cursor-pointer rounded-none border border-amber-600 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                >
                  PROCESAR VENTA
                </button>"""
content = content.replace(old_submit, new_submit)

# Remove the printReceipt checkbox from the modal UI
checkbox_ui = """                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={printReceipt} onChange={(e) => setPrintReceipt(e.target.checked)} className="w-5 h-5 accent-amber-500 rounded-none cursor-pointer" />
                  <span className="font-mono text-xs uppercase text-editorial-text-primary tracking-wider">Imprimir Ticket</span>
                </label>"""
content = content.replace(checkbox_ui, "<div></div>")

# 3. Add the Print Prompt Modal at the very end
print_prompt_jsx = """
      {/* PRINT PROMPT MODAL */}
      {printPromptReceipt && (
        <div className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-editorial-bg/90 backdrop-blur-sm">
          <div className="bg-editorial-card border border-amber-500 p-8 flex flex-col items-center rounded-none shadow-[0_0_50px_rgba(245,158,11,0.2)] max-w-sm w-full text-center animate-scale-up">
            <CheckCircle className="w-16 h-16 text-amber-500 mb-4" />
            <h2 className="font-serif text-2xl font-black text-editorial-text-primary uppercase tracking-tight mb-2">Venta Procesada</h2>
            <p className="font-mono text-xs text-editorial-text-muted mb-8">La venta ha sido registrada exitosamente. ¿Desea imprimir el comprobante de caja?</p>
            
            <div className="flex gap-4 w-full">
              <button 
                onClick={() => setPrintPromptReceipt(null)}
                className="flex-1 h-12 border border-editorial-border text-editorial-text-muted font-bold font-mono text-xs uppercase hover:bg-editorial-bg transition-colors cursor-pointer rounded-none"
              >
                NO, CERRAR
              </button>
              <button 
                onClick={() => {
                  window.print();
                  setPrintPromptReceipt(null);
                }}
                className="flex-1 h-12 bg-amber-500 text-editorial-bg font-bold font-mono text-xs uppercase hover:bg-amber-400 transition-colors cursor-pointer rounded-none border border-amber-600 shadow-[0_0_15px_rgba(245,158,11,0.3)] flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                SÍ, IMPRIMIR
              </button>
            </div>
          </div>
        </div>
      )}
"""
content = content.replace('    </div>\n  );\n}\n', print_prompt_jsx + '\n    </div>\n  );\n}\n')

with open('src/components/CheesePOSView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Print prompt and button fixes applied')
