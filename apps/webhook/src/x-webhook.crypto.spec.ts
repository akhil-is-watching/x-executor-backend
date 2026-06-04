import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import {
  createCrcResponse,
  verifyWebhookSignature,
} from './x-webhook.crypto';

describe('x-webhook.crypto', () => {
  const consumerSecret = 'test-consumer-secret';

  describe('createCrcResponse', () => {
    it('returns sha256-prefixed base64 HMAC of crc_token', () => {
      const crcToken = 'challenge-token';
      const expectedHash = createHmac('sha256', consumerSecret)
        .update(crcToken)
        .digest('base64');

      expect(createCrcResponse(crcToken, consumerSecret)).toEqual({
        response_token: `sha256=${expectedHash}`,
      });
    });
  });

  describe('verifyWebhookSignature', () => {
    it('accepts a valid signature', () => {
      const rawBody = Buffer.from(
        JSON.stringify({ for_user_id: '1', tweet_create_events: [] }),
      );
      const signature = `sha256=${createHmac('sha256', consumerSecret)
        .update(rawBody)
        .digest('base64')}`;

      expect(() =>
        verifyWebhookSignature(rawBody, signature, consumerSecret),
      ).not.toThrow();
    });

    it('rejects missing signature header', () => {
      const rawBody = Buffer.from('{}');
      expect(() =>
        verifyWebhookSignature(rawBody, undefined, consumerSecret),
      ).toThrow(UnauthorizedException);
    });

    it('rejects invalid signature', () => {
      const rawBody = Buffer.from('{}');
      expect(() =>
        verifyWebhookSignature(rawBody, 'sha256=invalid', consumerSecret),
      ).toThrow(UnauthorizedException);
    });
  });
});
