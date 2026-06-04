export interface NatsDlqMessage {
  stream: string;
  originalSubject: string;
  filterSubject: string;
  durable: string;
  deliveryCount: number;
  failedAt: string;
  error: string;
  payload: unknown;
}
