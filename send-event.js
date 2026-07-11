const path = '/app/node_modules/.pnpm/kafkajs@2.2.4/node_modules/kafkajs';
const { Kafka } = require(path);
(async () => {
  const k = new Kafka({ brokers: ['license-kafka:9092'], clientId: 'test' });
  const p = k.producer();
  await p.connect();
  await p.send({
    topic: 'tenant.lifecycle',
    messages: [{ value: JSON.stringify({type:'tenant.reactivated',tenant_id:'test-001',slug:'empresa-prueba',timestamp:'2026-07-11T03:15:00Z'})}]
  });
  console.log('EVENTO REACTIVATED ENVIADO');
  await p.disconnect();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
