/** Global Nest route prefix for Hub, Webhook, Processor, Sender, Scheduler, Analytics. */
export const API_GLOBAL_PREFIX = 'xbot/v1/api';

/** Controller path segments (after global prefix) for each service health check. */
export const HUB_HEALTH_PATH = 'hub/health';
export const WEBHOOK_HEALTH_PATH = 'webhook/health';
export const PROCESSOR_HEALTH_PATH = 'processor/health';
export const SENDER_HEALTH_PATH = 'sender/health';
export const SCHEDULER_HEALTH_PATH = 'scheduler/health';
export const ANALYTICS_HEALTH_PATH = 'analytics/health';

export function apiRoutePath(...segments: string[]): string {
  return `/${API_GLOBAL_PREFIX}/${segments.join('/')}`;
}
