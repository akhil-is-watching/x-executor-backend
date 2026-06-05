/**
 * X Activity API wire types (OpenAPI v2.165).
 *
 * `twitter-api-v2` has no Activity endpoint types — we call v2.post/get/delete directly.
 * `@xdevplatform/xdk@0.5.0` exposes ActivityClient but its generated types are incomplete
 * for this use case (no dm.* event types, no direction filter on ActivitySubscriptionFilter).
 *
 * These types match the JSON snake_case bodies returned by api.x.com when using twitter-api-v2.
 */

export type XActivityDmInboundEventType = 'dm.received' | 'chat.received';

export interface XActivitySubscriptionFilter {
  user_id: string;
  direction?: 'inbound' | 'outbound';
  keyword?: string;
}

export interface XActivitySubscriptionCreateRequest {
  event_type: XActivityDmInboundEventType;
  filter: XActivitySubscriptionFilter;
  webhook_id: string;
  tag?: string;
}

export interface XActivitySubscription {
  subscription_id: string;
  event_type: string;
  filter: XActivitySubscriptionFilter;
  created_at?: string;
  updated_at?: string;
  tag?: string;
  webhook_id?: string;
}

export interface XActivitySubscriptionCreateResponse {
  data?: {
    subscription?: XActivitySubscription;
    total_subscriptions_for_instance_id?: number;
  };
  errors?: unknown[];
  meta?: { total_subscriptions?: number };
}

export interface XActivitySubscriptionListResponse {
  data?: XActivitySubscription[];
  errors?: unknown[];
  meta?: { total_subscriptions?: number };
}

export interface XActivitySubscriptionIds {
  dmSubscriptionId: string;
  chatSubscriptionId: string;
}

/** Extract subscription_id from create response (snake_case wire format). */
export function parseActivitySubscriptionId(
  response: XActivitySubscriptionCreateResponse,
): string | null {
  const subscription = response.data?.subscription;
  if (!subscription) {
    return null;
  }
  if (typeof subscription.subscription_id === 'string') {
    return subscription.subscription_id;
  }
  return null;
}
