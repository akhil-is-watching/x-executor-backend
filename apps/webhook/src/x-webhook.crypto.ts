import { UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export interface CrcResponse {
  response_token: string;
}

export function createCrcResponse(
  crcToken: string,
  consumerSecret: string,
): CrcResponse {
  const hash = createHmac('sha256', consumerSecret)
    .update(crcToken)
    .digest('base64');
  return { response_token: `sha256=${hash}` };
}

export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  consumerSecret: string,
): void {
  if (!signatureHeader) {
    throw new UnauthorizedException('Missing x-twitter-webhooks-signature header');
  }

  const expected = createHmac('sha256', consumerSecret)
    .update(rawBody)
    .digest('base64');
  const expectedToken = `sha256=${expected}`;

  const received = signatureHeader.trim();
  const receivedBuf = Buffer.from(received);
  const expectedBuf = Buffer.from(expectedToken);

  if (
    receivedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(receivedBuf, expectedBuf)
  ) {
    throw new UnauthorizedException('Invalid webhook signature');
  }
}
