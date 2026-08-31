const base = 'http://license-app:8080/api/v1/tenants/c22fa1c5-0b42-43c7-8a08-00c0295d2a40/reportes/consumo';
const body = JSON.stringify({
  documentoId: '11111111-1111-1111-1111-111111111111',
  usuarioId: '3fd14cea-4411-448a-99ff-20293af65739',
  numeroPuntos: 3,
});

async function probe(name, headers) {
  try {
    const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
    const text = await r.text();
    console.log(`\n[${name}] status=${r.status} body=${text || '(vacío)'}`);
  } catch (e) {
    console.log(`\n[${name}] ERROR ${e.message}`);
  }
}

const secret = 'mikel-gateway-internal-dev-2026';
const user = '3fd14cea-4411-448a-99ff-20293af65739';
const tenant = 'c22fa1c5-0b42-43c7-8a08-00c0295d2a40';

await probe('sin-headers', {});
await probe('gateway-platform_admin', { 'X-Consumer-Id': user, 'X-Gateway-Secret': secret, 'X-User-Role': 'platform_admin', 'X-License-Id': tenant });
await probe('gateway-admin', { 'X-Consumer-Id': user, 'X-Gateway-Secret': secret, 'X-User-Role': 'admin', 'X-License-Id': tenant });
await probe('gateway-sin-license', { 'X-Consumer-Id': user, 'X-Gateway-Secret': secret, 'X-User-Role': 'platform_admin' });
await probe('gateway-secret-malo', { 'X-Consumer-Id': user, 'X-Gateway-Secret': 'incorrecto', 'X-User-Role': 'platform_admin', 'X-License-Id': tenant });
