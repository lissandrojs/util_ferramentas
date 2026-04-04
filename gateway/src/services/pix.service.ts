// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require('qrcode') as typeof import('qrcode');import { buildPixPayload } from '../utils/licenseUtils';
import { logger } from '../utils/logger';

export type PixGateway = 'static' | 'asaas' | 'efipay';

export interface PixChargeResult {
  qrcode_base64: string;    // base64 PNG for display
  qrcode_text: string;      // "copia e cola" string
  gateway: PixGateway;
  gateway_id?: string;
  txid?: string;
  expires_at?: Date;
  payload_url?: string;
  pix_key: string;
}

// ── Detect which gateway is configured ──────────────────────────
export function detectGateway(): PixGateway {
  if (process.env.ASAAS_API_KEY) return 'asaas';
  if (process.env.EFIPAY_CLIENT_ID) return 'efipay';
  return 'static';
}

// ── Main entry point ─────────────────────────────────────────────
export async function createPixCharge(params: {
  amountCents: number;
  customerName: string;
  customerEmail: string;
  customerDoc?: string;
  description: string;
  txId: string;           // our internal reference (license ID prefix)
}): Promise<PixChargeResult> {
  const gateway = detectGateway();
  logger.info(`Creating PIX charge — gateway: ${gateway}, amount: ${params.amountCents}`);

  switch (gateway) {
    case 'asaas':  return createAsaasCharge(params);
    case 'efipay': return createEfiPayCharge(params);
    default:       return createStaticPix(params);
  }
}

// ─────────────────────────────────────────────────────────────────
// STATIC PIX — No gateway needed. Uses your configured PIX key.
// Payment is confirmed manually by admin or via polling.
// ─────────────────────────────────────────────────────────────────
async function createStaticPix(params: {
  amountCents: number;
  description: string;
  txId: string;
}): Promise<PixChargeResult> {
  const pixKey      = process.env.PIX_KEY!;
  const merchantName = process.env.PIX_MERCHANT_NAME || 'EMPRESA';
  const merchantCity = process.env.PIX_MERCHANT_CITY || 'SAO PAULO';

  const payload = buildPixPayload({
    pixKey,
    merchantName,
    merchantCity,
    amount: params.amountCents,
    txId: params.txId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25),
    description: params.description,
  });

  const qrcode_base64 = await QRCode.toDataURL(payload, {
    width: 300,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });

  return {
    qrcode_base64,
    qrcode_text: payload,
    gateway: 'static',
    pix_key: pixKey,
    txid: params.txId,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
  };
}

// ─────────────────────────────────────────────────────────────────
// ASAAS — Automated PIX with webhook confirmation
// Docs: https://asaasv3.docs.apiary.io/
// Sign up free: https://www.asaas.com
// ─────────────────────────────────────────────────────────────────
async function createAsaasCharge(params: {
  amountCents: number;
  customerName: string;
  customerEmail: string;
  customerDoc?: string;
  description: string;
  txId: string;
}): Promise<PixChargeResult> {
  const apiKey   = process.env.ASAAS_API_KEY!;
  const baseUrl  = process.env.ASAAS_SANDBOX === 'true'
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/v3';

  // 1. Find or create customer
  const customerRes = await fetch(`${baseUrl}/customers?email=${encodeURIComponent(params.customerEmail)}`, {
    headers: { 'access_token': apiKey },
  });
  const customerData = await customerRes.json() as { data?: Array<{ id: string }> };

  let customerId: string;

  if (customerData.data && customerData.data.length > 0) {
    customerId = customerData.data[0].id;
  } else {
    const newCustomer = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: { 'access_token': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: params.customerName,
        email: params.customerEmail,
        cpfCnpj: params.customerDoc?.replace(/\D/g, '') || undefined,
      }),
    });
    const nc = await newCustomer.json() as { id: string };
    customerId = nc.id;
  }

  // 2. Create PIX charge
  const chargeRes = await fetch(`${baseUrl}/payments`, {
    method: 'POST',
    headers: { 'access_token': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer: customerId,
      billingType: 'PIX',
      value: params.amountCents / 100,
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      description: params.description,
      externalReference: params.txId,
    }),
  });
  const charge = await chargeRes.json() as {
    id: string;
    status: string;
    nossoNumero?: string;
  };

  if (!charge.id) {
    logger.error('Asaas charge creation failed: ' + JSON.stringify(charge));
    throw new Error('Failed to create Asaas charge');
  }

  // 3. Get PIX QR Code
  const qrRes = await fetch(`${baseUrl}/payments/${charge.id}/pixQrCode`, {
    headers: { 'access_token': apiKey },
  });
  const qrData = await qrRes.json() as {
    encodedImage: string;
    payload: string;
    expirationDate: string;
  };

  return {
    qrcode_base64: `data:image/png;base64,${qrData.encodedImage}`,
    qrcode_text: qrData.payload,
    gateway: 'asaas',
    gateway_id: charge.id,
    txid: params.txId,
    pix_key: process.env.PIX_KEY || 'via-asaas',
    expires_at: new Date(qrData.expirationDate),
  };
}

// ─────────────────────────────────────────────────────────────────
// EFI PAY (ex-Gerencianet) — Brazilian PIX gateway
// Docs: https://dev.efipay.com.br/docs/api-pix/
// ─────────────────────────────────────────────────────────────────
async function createEfiPayCharge(params: {
  amountCents: number;
  customerName: string;
  customerDoc?: string;
  description: string;
  txId: string;
}): Promise<PixChargeResult> {
  // EFI requires OAuth — simplified implementation
  const clientId     = process.env.EFIPAY_CLIENT_ID!;
  const clientSecret = process.env.EFIPAY_CLIENT_SECRET!;
  const sandbox      = process.env.EFIPAY_SANDBOX === 'true';
  const baseUrl      = sandbox
    ? 'https://pix-h.api.efipay.com.br'
    : 'https://pix.api.efipay.com.br';

  // 1. Get OAuth token
  const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  });
  const tokenData = await tokenRes.json() as { access_token: string };

  // 2. Create immediate charge (cob imediata)
  const txid = params.txId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 35);
  const cobRes = await fetch(`${baseUrl}/v2/cob/${txid}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      calendario: { expiracao: 86400 },
      devedor: {
        cpf: params.customerDoc?.replace(/\D/g, '').slice(0, 11) || '00000000000',
        nome: params.customerName,
      },
      valor: { original: (params.amountCents / 100).toFixed(2) },
      chave: process.env.PIX_KEY!,
      solicitacaoPagador: params.description,
    }),
  });
  const cob = await cobRes.json() as { loc?: { id: number }; txid: string };

  // 3. Get QR Code
  const qrRes = await fetch(`${baseUrl}/v2/loc/${cob.loc?.id}/qrcode`, {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
  });
  const qrData = await qrRes.json() as {
    imagemQrcode: string;
    qrcode: string;
  };

  return {
    qrcode_base64: `data:image/png;base64,${qrData.imagemQrcode}`,
    qrcode_text: qrData.qrcode,
    gateway: 'efipay',
    txid,
    pix_key: process.env.PIX_KEY!,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

// ─────────────────────────────────────────────────────────────────
// Verify Asaas webhook signature
// ─────────────────────────────────────────────────────────────────
export function verifyAsaasWebhook(
  payload: string,
  signature: string
): boolean {
  const secret = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!secret) return true; // no verification configured

  const { createHmac } = require('crypto');
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return expected === signature;
}
