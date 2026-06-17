/** Primary JetStream stream for application events (excludes DLQ subjects). */
export const NATS_STREAM_NAME = 'X_EVENTS' as const;

export const NATS_STREAM_SUBJECTS = [
  'x.webhook.>',
  'x.dm.>',
  'x.campaign.>',
] as const;

/** Dead-letter stream for messages that exceed {@link NATS_MAX_DELIVER}. */
export const NATS_DLQ_STREAM_NAME = 'X_EVENTS_DLQ' as const;

export const NATS_DLQ_SUBJECT_PREFIX = 'x.dlq' as const;

export const NATS_DLQ_STREAM_SUBJECTS = ['x.dlq.>'] as const;

export const NATS_SUBJECT_WEBHOOK_RECEIVED = 'x.webhook.received' as const;

export const NATS_SUBJECT_DM_REPLY_READY = 'x.dm.reply.ready' as const;

export const NATS_SUBJECT_DM_HANDOFF_NOTIFY = 'x.dm.handoff.notify' as const;

export const NATS_SUBJECT_CAMPAIGN_CREATED = 'x.campaign.created' as const;

export const NATS_SUBJECT_CAMPAIGN_DM_READY = 'x.campaign.dm.ready' as const;

export const NATS_SUBJECT_CAMPAIGN_ANALYTICS = 'x.campaign.analytics' as const;

export const NATS_DURABLE_PROCESSOR_WEBHOOK = 'processor-webhook' as const;

export const NATS_DURABLE_SENDER_DM_REPLY = 'sender-dm-reply' as const;

export const NATS_DURABLE_SENDER_HANDOFF = 'sender-handoff-notify' as const;

export const NATS_DURABLE_SCHEDULER_CAMPAIGN = 'scheduler-campaign' as const;

export const NATS_DURABLE_SENDER_CAMPAIGN = 'sender-campaign' as const;

export const NATS_DURABLE_ANALYTICS_CAMPAIGN = 'analytics-campaign' as const;

/** Delivery attempts before a failed message is published to the DLQ and terminated. */
export const NATS_MAX_DELIVER = 5 as const;

export function natsDlqSubject(sourceSubject: string): string {
  if (sourceSubject.startsWith(`${NATS_DLQ_SUBJECT_PREFIX}.`)) {
    return sourceSubject;
  }
  if (sourceSubject.startsWith('x.')) {
    return `${NATS_DLQ_SUBJECT_PREFIX}.${sourceSubject.slice(2)}`;
  }
  return `${NATS_DLQ_SUBJECT_PREFIX}.${sourceSubject}`;
}
