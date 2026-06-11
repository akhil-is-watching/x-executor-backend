/** Global Nest route prefix for Webhook, Processor, Sender, Scheduler, Analytics. */
export const API_GLOBAL_PREFIX = 'xbot/v1/api';

/** Hub REST + OAuth routes (Nest global prefix on apps/hub). */
export const HUB_API_PREFIX = `${API_GLOBAL_PREFIX}/hub`;

/** Controller path segments (after each service global prefix) for health checks. */
export const HUB_HEALTH_PATH = 'health';
export const WEBHOOK_HEALTH_PATH = 'webhook/health';
export const PROCESSOR_HEALTH_PATH = 'processor/health';
export const SENDER_HEALTH_PATH = 'sender/health';
export const SCHEDULER_HEALTH_PATH = 'scheduler/health';
export const ANALYTICS_HEALTH_PATH = 'analytics/health';

export function apiRoutePath(...segments: string[]): string {
  return `/${API_GLOBAL_PREFIX}/${segments.join('/')}`;
}

export function hubApiRoutePath(...segments: string[]): string {
  return `/${HUB_API_PREFIX}/${segments.join('/')}`;
}
