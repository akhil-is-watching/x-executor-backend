import { NATS_SUBJECT_WEBHOOK_RECEIVED, natsDlqSubject } from './nats.constants';

describe('nats.constants', () => {
  it('maps app subjects to DLQ subjects', () => {
    expect(natsDlqSubject(NATS_SUBJECT_WEBHOOK_RECEIVED)).toBe(
      'x.dlq.webhook.received',
    );
    expect(natsDlqSubject('x.dm.reply.ready')).toBe('x.dlq.dm.reply.ready');
  });

  it('leaves DLQ subjects unchanged', () => {
    expect(natsDlqSubject('x.dlq.webhook.received')).toBe('x.dlq.webhook.received');
  });
});
