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
  /** Not valid for dm.received / chat.received — event type already scopes direction. */
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

/** Full HTTP body (rare — twitter-api-v2 v2.post usually returns unwrapped `data`). */
export interface XActivitySubscriptionCreateResponse {
  data?:
    | XActivitySubscription
    | XActivitySubscription[]
    | {
        subscription?: XActivitySubscription;
        total_subscriptions_for_instance_id?: number;
      };
  subscription?: XActivitySubscription;
  subscription_id?: string;
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

function readSubscriptionId(value: unknown): string | null {
  const record = value as Record<string, unknown> | null;
  if (!record || typeof record !== 'object') {
    return null;
  }
  if (typeof record.subscription_id === 'string') {
    return record.subscription_id;
  }
  const nested = record.subscription;
  if (nested && typeof nested === 'object') {
    const nestedId = (nested as Record<string, unknown>).subscription_id;
    if (typeof nestedId === 'string') {
      return nestedId;
    }
  }
  return null;
}

/**
 * Extract subscription_id from create response.
 * twitter-api-v2 `v2.post` returns the unwrapped top-level `data` field.
 */
export function parseActivitySubscriptionId(
  response: XActivitySubscriptionCreateResponse | XActivitySubscription,
): string | null {
  const direct = readSubscriptionId(response);
  if (direct) {
    return direct;
  }

  const wrapped = response as XActivitySubscriptionCreateResponse;
  const data = wrapped.data;
  if (Array.isArray(data)) {
    return readSubscriptionId(data[0]);
  }
  return readSubscriptionId(data);
}
