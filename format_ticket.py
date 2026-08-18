import re

with open('src/components/CheesePOSView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the receipt creation to include exchangeRate
receipt_creation = """    const receipt = {
      id: `REC-${Date.now().toString().slice(-6)}`,
      date: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      clientName: customerName,
      items: [...cart],
      subtotal,
      tax,
      total,
      paymentMethod: finalPaymentMethod,
      notes: refDetails,
      paidAmount,
      debtAmount
    };"""

new_receipt_creation = """    const receipt = {
      id: `REC-${Date.now().toString().slice(-6)}`,
      date: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      clientName: customerName,
      items: [...cart],
      subtotal,
      tax,
      total,
      paymentMethod: finalPaymentMethod,
      notes: refDetails,
      paidAmount,
      debtAmount,
      exchangeRate
    };"""
content = content.replace(receipt_creation, new_receipt_creation)

# 2. Update the JSX of the receipt to add className="print-ticket" and required 58mm format
old_receipt_jsx = """            {/* Last Generated Ticket / Receipt Box */}
            {lastReceipt && (
              <div className="bg-editorial-card border border-editorial-border rounded-none p-6 font-mono text-xs text-editorial-text-primary space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-amber-500/10 text-amber-500 border-b border-l border-amber-500/30 px-3 py-1 text-[9px] font-bold uppercase tracking-wider">
                  ÉXITO
                </div>
                <div className="text-center space-y-1">
                  <h4 className="font-serif text-md font-extrabold text-editorial-text-primary uppercase tracking-tight">QUESERÍA KALU</h4>
                  <p className="text-[10px] text-editorial-text-muted">AV. CONSTITUCIÓN #1420</p>
                  <p className="text-[9px] text-editorial-text-muted/60">{lastReceipt.date} • {lastReceipt.id}</p>
                </div>
                
                <div className="border-t border-dashed border-editorial-border/60 my-2" />
                
                <div className="space-y-1">
                  <span className="text-[9px] text-editorial-text-muted uppercase">Cliente:</span>
                  <p className="font-semibold text-[11px]">{lastReceipt.clientName}</p>
                </div>

                <div className="border-t border-dashed border-editorial-border/60 my-2" />

                <div className="space-y-1.5">
                  {lastReceipt.items.map((it: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-[11px]">
                      <span className="truncate max-w-[180px]">{it.name}</span>
                      <span>${it.subtotal.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-dashed border-editorial-border/60 my-2" />

                <div className="space-y-1 text-[11px] text-right">
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">Subtotal:</span>
                    <span>${lastReceipt.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-editorial-text-muted">IVA (16.0%):</span>
                    <span>${lastReceipt.tax.toFixed(2)}</span>
                  </div>
                  {lastReceipt.debtAmount > 0 ? (
                    <>
                      <div className="flex justify-between font-bold text-editorial-text-primary pt-1 border-t border-editorial-border/40">
                        <span>Total de la Venta:</span>
                        <span>${lastReceipt.total.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-amber-500">
                        <span>Pagado en Efectivo:</span>
                        <span>${lastReceipt.paidAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-amber-500">
                        <span>Cargado a Deuda/Libreta:</span>
                        <span>${lastReceipt.debtAmount.toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between font-bold text-sm text-amber-500 pt-1 border-t border-editorial-border/40">
                      <span>Total Pagado:</span>
                      <span>${lastReceipt.total.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="text-[9px] text-editorial-text-muted pt-1">
                    Método: {lastReceipt.paymentMethod}
                  </div>
                </div>

                <div className="text-center text-[9px] text-editorial-text-muted/60 pt-3 border-t border-dashed border-editorial-border/60">
                  ¡Gracias por apoyar el comercio de Martín Niño!
                </div>

                <button
                  onClick={() => window.print()}
                  className="w-full py-2 bg-editorial-bg hover:bg-editorial-card border border-editorial-border text-[10px] font-bold uppercase tracking-widest text-editorial-text-primary flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir Comprobante
                </button>
              </div>
            )}"""

new_receipt_jsx = """            {/* Last Generated Ticket / Receipt Box */}
            {lastReceipt && (
              <div className="print-ticket bg-editorial-card border border-editorial-border rounded-none p-6 font-mono text-xs text-editorial-text-primary space-y-4 relative overflow-hidden">
                <div className="no-print absolute top-0 right-0 bg-amber-500/10 text-amber-500 border-b border-l border-amber-500/30 px-3 py-1 text-[9px] font-bold uppercase tracking-wider">
                  ÉXITO
                </div>
                
                <div className="text-center space-y-1">
                  <h4 className="font-serif text-md font-extrabold uppercase tracking-tight">QUESERÍA KALU</h4>
                  <p className="text-[10px]">AV. CONSTITUCIÓN #1420</p>
                  <p className="text-[9px]">{lastReceipt.date} • {lastReceipt.id}</p>
                </div>
                
                <div className="border-t border-dashed border-editorial-border/60 my-2" />
                
                <div className="space-y-1">
                  <span className="text-[9px] uppercase">Cliente:</span>
                  <p className="font-semibold text-[11px]">{lastReceipt.clientName}</p>
                </div>

                <div className="border-t border-dashed border-editorial-border/60 my-2" />

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[9px] font-bold border-b border-editorial-border/40 pb-1 mb-1">
                    <span>CANT x PROD</span>
                    <span>TOTAL</span>
                  </div>
                  {lastReceipt.items.map((it: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-[11px]">
                      <span className="truncate max-w-[140px]">{it.quantityKg}kg x {it.name}</span>
                      <span>${it.subtotal.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-dashed border-editorial-border/60 my-2" />

                <div className="space-y-1 text-[11px] text-right">
                  <div className="flex justify-between font-bold pt-1 border-t border-editorial-border/40">
                    <span>TOTAL VENTA:</span>
                    <span>${lastReceipt.total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] pb-1 border-b border-editorial-border/40">
                    <span>EQUIVALENTE BS:</span>
                    <span>Bs {(lastReceipt.total * (lastReceipt.exchangeRate || exchangeRate)).toFixed(2)}</span>
                  </div>

                  {lastReceipt.debtAmount > 0 ? (
                    <>
                      <div className="flex justify-between pt-1">
                        <span>PAGADO:</span>
                        <span>${lastReceipt.paidAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>A DEUDA:</span>
                        <span>${lastReceipt.debtAmount.toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between font-bold pt-1">
                      <span>TOTAL PAGADO:</span>
                      <span>${lastReceipt.total.toFixed(2)}</span>
                    </div>
                  )}
                  
                  <div className="text-left text-[9px] pt-2 mt-2 border-t border-dashed border-editorial-border/40">
                    <p className="font-bold">DESGLOSE PAGO:</p>
                    <p>Método: {lastReceipt.paymentMethod}</p>
                    {lastReceipt.notes && <p>Ref: {lastReceipt.notes}</p>}
                    <p>Tasa aplicada: Bs {lastReceipt.exchangeRate || exchangeRate}</p>
                  </div>
                </div>

                <div className="text-center text-[9px] pt-3 mt-3 border-t border-dashed border-editorial-border/60">
                  <p className="font-bold">¡GRACIAS POR SU COMPRA!</p>
                  <p>Comercio de Martín Niño</p>
                </div>

                <button
                  onClick={() => window.print()}
                  className="no-print w-full mt-4 py-2 bg-editorial-bg hover:bg-editorial-card border border-editorial-border text-[10px] font-bold uppercase tracking-widest text-editorial-text-primary flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir Comprobante
                </button>
              </div>
            )}"""

content = content.replace(old_receipt_jsx, new_receipt_jsx)

with open('src/components/CheesePOSView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Ticket 58mm format configured')
