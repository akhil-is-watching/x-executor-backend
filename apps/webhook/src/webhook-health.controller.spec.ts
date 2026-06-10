import { WebhookHealthController } from './webhook-health.controller';

describe('WebhookHealthController', () => {
  it('returns health status', () => {
    const controller = new WebhookHealthController();
    expect(controller.health()).toEqual({ status: 'ok' });
  });
});
