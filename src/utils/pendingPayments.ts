/**
 * Helper puro para el alertador en tiempo real "PAGOS MUNDO KALU" (Fase 3C / 3C.1)
 * Calcula autoritativamente el número de pagos PWA pendientes de revisión correspondientes exclusivamente a CLIENTES MUNDO KALU.
 */

export function isClientMundoKaluPayment(payment: any): boolean {
  if (!payment || typeof payment !== 'object') return false;

  // 1. Descartar pagos explícitos de productores / proveedores
  if (
    payment.type === 'productor' ||
    payment.portalType === 'producer' ||
    payment.portalType === 'supplier' ||
    payment.entityType === 'supplier' ||
    payment.entityType === 'producer' ||
    Boolean(payment.supplierId)
  ) {
    return false;
  }

  // 2. Comprobar discriminadores explícitos de cliente (Nuevos pagos)
  if (
    payment.entityType === 'client' ||
    payment.source === 'client_portal' ||
    payment.portalType === 'client'
  ) {
    return true;
  }

  // 3. Registros legacy con vínculos claros a cliente (clientId o installmentId)
  if (payment.clientId || payment.installmentId) {
    return true;
  }

  // Registros ambiguos con solo entityId NO se cuentan (Fase 3C.2)
  return false;
}

export function getPendingMundoKaluPaymentCount(payments: any[] | null | undefined): number {
  if (!Array.isArray(payments)) return 0;
  return payments.filter(p => p && (p.status === 'pending' || p.status === 'in_review') && isClientMundoKaluPayment(p)).length;
}
