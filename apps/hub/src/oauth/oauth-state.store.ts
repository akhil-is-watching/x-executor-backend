import { Injectable } from '@nestjs/common';
import { RedisService } from '@app/redis';

export interface OAuthStatePayload {
  inviteToken: string;
  oauthTokenSecret: string;
  orgId: string;
}

const TTL_SECONDS = 600;

@Injectable()
export class OAuthStateStore {
  constructor(private readonly redis: RedisService) {}

  private key(oauthToken: string): string {
    return `oauth:state:${oauthToken}`;
  }

  async save(oauthToken: string, payload: OAuthStatePayload): Promise<void> {
    await this.redis.setJson(this.key(oauthToken), payload, TTL_SECONDS);
  }

  async consume(oauthToken: string): Promise<OAuthStatePayload | null> {
    const key = this.key(oauthToken);
    const payload = await this.redis.getJson<OAuthStatePayload>(key);
    if (payload) {
      await this.redis.del(key);
    }
    return payload;
  }
}
