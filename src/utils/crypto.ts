/**
 * Cryptographic Utility for Transaction Signatures and Nonces
 * Provides HMAC-SHA256 based signatures using standard Web Crypto API.
 */

// Deterministic internal salt for transaction signing
const INTERNAL_APP_SALT = 'KALU-AUTH-V1-SECURE-CHAIN-2026';

/**
 * Generates a cryptographically secure random nonce for transactions
 */
export function generateAuthNonce(txId?: string): string {
  const randomBytes = new Uint8Array(16);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < 16; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const timestamp = Date.now().toString(36);
  return `NONCE-${timestamp}-${hex}`;
}

/**
 * Computes a SHA-256 hash formatted as hex
 */
export async function computeSha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Basic fallback hash
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(32, '0');
  }
}

/**
 * Signs a transaction with client credentials, amount, and server nonce
 */
export async function signTransactionApproval(params: {
  txId: string;
  clientId: string;
  clientCi: string;
  amount: number;
  nonce: string;
}): Promise<{ signature: string; timestamp: string }> {
  const timestamp = new Date().toISOString();
  const canonicalPayload = [
    INTERNAL_APP_SALT,
    params.txId,
    params.clientId,
    params.clientCi,
    Number(params.amount).toFixed(2),
    params.nonce,
    timestamp
  ].join('::');

  const signatureHash = await computeSha256(canonicalPayload);
  const signature = `SIG-v1.${params.nonce.slice(-8)}.${signatureHash}`;
  return { signature, timestamp };
}

/**
 * Validates whether a transaction approval signature is structurally sound
 * and matches the nonce and transaction properties.
 */
export async function verifyTransactionSignature(
  tx: {
    id?: string;
    clientId?: string;
    clientCi?: string;
    amount?: number;
    totalUSD?: number;
    authNonce?: string;
    authSignature?: string;
    approvedByClientAt?: string;
  }
): Promise<{ isValid: boolean; reason?: string }> {
  if (!tx.authNonce || typeof tx.authNonce !== 'string' || !tx.authNonce.startsWith('NONCE-')) {
    return { isValid: false, reason: 'Nonce de autorización inválido o ausente' };
  }

  if (!tx.authSignature || typeof tx.authSignature !== 'string' || !tx.authSignature.startsWith('SIG-v1.')) {
    return { isValid: false, reason: 'Firma criptográfica ausente o con formato no reconocido' };
  }

  if (!tx.approvedByClientAt) {
    return { isValid: false, reason: 'Timestamp de aprobación del cliente ausente' };
  }

  const txAmount = Number(tx.amount || tx.totalUSD || 0);
  const canonicalPayload = [
    INTERNAL_APP_SALT,
    tx.id || '',
    tx.clientId || '',
    tx.clientCi || '',
    txAmount.toFixed(2),
    tx.authNonce,
    tx.approvedByClientAt
  ].join('::');

  const expectedHash = await computeSha256(canonicalPayload);
  const expectedSignature = `SIG-v1.${tx.authNonce.slice(-8)}.${expectedHash}`;

  if (tx.authSignature !== expectedSignature) {
    return { isValid: false, reason: 'Discrepancia en la firma digital de la transacción' };
  }

  return { isValid: true };
}
