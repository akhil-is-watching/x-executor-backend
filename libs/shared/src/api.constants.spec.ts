import {
  ANALYTICS_HEALTH_PATH,
  API_GLOBAL_PREFIX,
  HUB_HEALTH_PATH,
  PROCESSOR_HEALTH_PATH,
  SCHEDULER_HEALTH_PATH,
  SENDER_HEALTH_PATH,
  WEBHOOK_HEALTH_PATH,
  apiRoutePath,
} from './api.constants';

describe('api.constants', () => {
  it('defines expected global prefix', () => {
    expect(API_GLOBAL_PREFIX).toBe('xbot/v1/api');
  });

  it('maps each service to a unique health path', () => {
    const paths = [
      HUB_HEALTH_PATH,
      WEBHOOK_HEALTH_PATH,
      PROCESSOR_HEALTH_PATH,
      SENDER_HEALTH_PATH,
      SCHEDULER_HEALTH_PATH,
      ANALYTICS_HEALTH_PATH,
    ];

    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual([
      'hub/health',
      'webhook/health',
      'processor/health',
      'sender/health',
      'scheduler/health',
      'analytics/health',
    ]);
  });

  it('builds full HTTP paths', () => {
    expect(apiRoutePath(HUB_HEALTH_PATH)).toBe('/xbot/v1/api/hub/health');
    expect(apiRoutePath(WEBHOOK_HEALTH_PATH)).toBe(
      '/xbot/v1/api/webhook/health',
    );
    expect(apiRoutePath(PROCESSOR_HEALTH_PATH)).toBe(
      '/xbot/v1/api/processor/health',
    );
  });
});
