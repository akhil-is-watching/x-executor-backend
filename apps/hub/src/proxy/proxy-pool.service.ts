import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RedisService } from '@app/redis';
import { WebshareService } from '@app/webshare';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import {
  ProxyAssignment,
  ProxyAssignmentDocument,
  PROXY_COOLDOWN_DAYS,
} from '../schemas/proxy-assignment.schema';
import {
  XConnection,
  XConnectionDocument,
} from '../schemas/x-connection.schema';

const PROXY_RESERVE_PREFIX = 'proxy:reserve:';
const PROXY_PENDING_PREFIX = 'proxy:pending:';
const PROXY_RESERVE_TTL_SECONDS = 600;
const PROXY_PENDING_TTL_SECONDS = PROXY_COOLDOWN_DAYS * 24 * 60 * 60;
const COOLDOWN_MS = PROXY_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

type ProxyReservation = {
  proxyId: string;
  proxyAddress?: string;
  proxyUrlEnc?: string;
  reuse: boolean;
};

@Injectable()
export class ProxyPoolService {
  private readonly logger = new Logger(ProxyPoolService.name);

  constructor(
    @InjectModel(ProxyAssignment.name)
    private readonly proxyAssignmentModel: Model<ProxyAssignmentDocument>,
    @InjectModel(XConnection.name)
    private readonly connectionModel: Model<XConnectionDocument>,
    private readonly webshare: WebshareService,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Called at OAuth start. Finds an available proxy, reserves it in Redis
   * for the duration of the OAuth flow.
   *
   * If the xUserId already has an active assignment (reconnect within 7 days),
   * that proxy is re-reserved. Otherwise picks from the free pool.
   *
   * Throws E206 if no proxy is available.
   */
  async reserveForOAuth(
    orgId: string,
    oauthToken: string,
    xUserId?: string,
  ): Promise<void> {
    if (xUserId) {
      const reuse = await this.findCooldownReuseReservation(xUserId);
      if (reuse) {
        await this.redis.setex(
          `${PROXY_RESERVE_PREFIX}${oauthToken}`,
          PROXY_RESERVE_TTL_SECONDS,
          JSON.stringify(reuse),
        );
        this.logger.log(
          `Proxy reserved (reuse within cooldown) for oauthToken=${oauthToken} xUserId=${xUserId}`,
        );
        return;
      }
    }

    const proxyId = await this.pickFreeProxyId();
    await this.redis.setex(
      `${PROXY_RESERVE_PREFIX}${oauthToken}`,
      PROXY_RESERVE_TTL_SECONDS,
      JSON.stringify({ proxyId, reuse: false }),
    );
    this.logger.log(
      `Proxy reserved proxyId=${proxyId} for oauthToken=${oauthToken}`,
    );
  }

  /**
   * Called at OAuth callback after XConnection is upserted.
   * Moves the OAuth reservation into a pending key until auth token and
   * XChat PIN are both configured.
   */
  async deferAssignmentFromReservation(
    xUserId: string,
    oauthToken: string,
  ): Promise<void> {
    const reserveKey = `${PROXY_RESERVE_PREFIX}${oauthToken}`;
    const raw = await this.redis.get(reserveKey);
    if (!raw) {
      this.logger.warn(
        `No proxy reservation found for oauthToken=${oauthToken} xUserId=${xUserId}; skipping defer`,
      );
      return;
    }

    await this.redis.del(reserveKey);
    await this.redis.setex(
      `${PROXY_PENDING_PREFIX}${xUserId}`,
      PROXY_PENDING_TTL_SECONDS,
      raw,
    );
    this.logger.log(`Proxy assignment deferred for xUserId=${xUserId}`);
  }

  /**
   * Assigns a proxy once auth token and XChat PIN are both set on the
   * connection.
   */
  async assignForConnectionIfReady(
    orgId: string,
    connection: Pick<
      XConnectionDocument,
      'xUserId' | 'authTokenEnc' | 'xchatPinEnc' | 'proxyUrlEnc'
    >,
  ): Promise<void> {
    if (
      !connection.authTokenEnc ||
      !connection.xchatPinEnc ||
      connection.proxyUrlEnc
    ) {
      return;
    }

    await this.assignForConnection(orgId, connection.xUserId);
  }

  /**
   * Reads a pending OAuth reservation (or cooldown reuse / free pool) and
   * writes the encrypted proxyUrl to XConnection.
   */
  async assignForConnection(orgId: string, xUserId: string): Promise<void> {
    const existingConnection = await this.connectionModel.findOne({
      xUserId,
      orgId: new Types.ObjectId(orgId),
      revokedAt: null,
    });
    if (existingConnection?.proxyUrlEnc) {
      return;
    }

    let reservation: ProxyReservation | null =
      await this.findCooldownReuseReservation(xUserId);

    if (reservation) {
      await this.redis.del(`${PROXY_PENDING_PREFIX}${xUserId}`);
    } else {
      const raw = await this.redis.get(`${PROXY_PENDING_PREFIX}${xUserId}`);
      if (raw) {
        await this.redis.del(`${PROXY_PENDING_PREFIX}${xUserId}`);
        reservation = JSON.parse(raw) as ProxyReservation;
      }
    }

    if (!reservation) {
      reservation = { proxyId: await this.pickFreeProxyId(), reuse: false };
    }

    const { proxyId, proxyAddress, proxyUrlEnc } =
      await this.resolveProxyCredentials(reservation, xUserId);
    if (!proxyUrlEnc) {
      return;
    }

    await this.proxyAssignmentModel.findOneAndUpdate(
      { xUserId },
      {
        $set: {
          xUserId,
          orgId: new Types.ObjectId(orgId),
          proxyId,
          proxyAddress,
          proxyUrlEnc,
          status: 'active',
          releasedAt: undefined,
        },
        $unset: { releasedAt: 1 },
      },
      { upsert: true },
    );

    await this.connectionModel.updateOne(
      { xUserId, orgId: new Types.ObjectId(orgId) },
      { $set: { proxyUrlEnc } },
    );

    this.logger.log(
      `Proxy assigned proxyId=${proxyId} to xUserId=${xUserId}`,
    );
  }

  /**
   * Called on disconnect. Marks proxy as in cooldown so it cannot be
   * reassigned for 7 days.
   */
  async releaseForConnection(xUserId: string): Promise<void> {
    const assignment = await this.proxyAssignmentModel.findOneAndUpdate(
      { xUserId, status: 'active' },
      { $set: { status: 'cooldown', releasedAt: new Date() } },
      { returnDocument: 'after' },
    );

    if (!assignment) {
      this.logger.warn(
        `No active proxy assignment found for xUserId=${xUserId}; nothing to release`,
      );
      return;
    }

    this.logger.log(
      `Proxy proxyId=${assignment.proxyId} moved to cooldown for xUserId=${xUserId}`,
    );
  }

  /**
   * Reclaims proxies whose 7-day cooldown has expired: replaces them on
   * Webshare (refreshing the IP) and marks them as released (back in pool).
   * Should be called lazily before pool checks or by a scheduled task.
   */
  async reclaimExpiredCooldowns(): Promise<void> {
    const cutoff = new Date(Date.now() - COOLDOWN_MS);
    const expired = await this.proxyAssignmentModel.find({
      status: 'cooldown',
      releasedAt: { $lt: cutoff },
    });

    for (const assignment of expired) {
      try {
        await this.webshare.replaceProxy(assignment.proxyAddress);
        await this.proxyAssignmentModel.updateOne(
          { _id: assignment._id },
          { $set: { status: 'released' } },
        );
        this.logger.log(
          `Proxy proxyId=${assignment.proxyId} reclaimed after cooldown`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Failed to reclaim proxy proxyId=${assignment.proxyId}: ${message}`,
        );
      }
    }
  }

  private async findCooldownReuseReservation(
    xUserId: string,
  ): Promise<ProxyReservation | null> {
    const existing = await this.proxyAssignmentModel.findOne({ xUserId });
    if (
      !existing ||
      existing.status !== 'cooldown' ||
      !existing.releasedAt
    ) {
      return null;
    }

    const age = Date.now() - existing.releasedAt.getTime();
    if (age >= COOLDOWN_MS) {
      return null;
    }

    return {
      proxyId: existing.proxyId,
      proxyAddress: existing.proxyAddress,
      proxyUrlEnc: existing.proxyUrlEnc,
      reuse: true,
    };
  }

  private async resolveProxyCredentials(
    reservation: ProxyReservation,
    xUserId: string,
  ): Promise<{
    proxyId: string;
    proxyAddress: string;
    proxyUrlEnc: string | null;
  }> {
    if (
      reservation.reuse &&
      reservation.proxyAddress &&
      reservation.proxyUrlEnc
    ) {
      this.logger.log(
        `Reusing proxy proxyId=${reservation.proxyId} for xUserId=${xUserId} (within 7-day cooldown)`,
      );
      return {
        proxyId: reservation.proxyId,
        proxyAddress: reservation.proxyAddress,
        proxyUrlEnc: reservation.proxyUrlEnc,
      };
    }

    const allProxies = await this.webshare.listProxies();
    const proxy = allProxies.find((p) => p.id === reservation.proxyId);
    if (!proxy) {
      this.logger.error(
        `Reserved proxy proxyId=${reservation.proxyId} not found in Webshare; cannot assign`,
      );
      return {
        proxyId: reservation.proxyId,
        proxyAddress: reservation.proxyAddress ?? '',
        proxyUrlEnc: null,
      };
    }

    return {
      proxyId: proxy.id,
      proxyAddress: proxy.proxy_address,
      proxyUrlEnc: this.tokenCrypto.encrypt(this.webshare.buildProxyUrl(proxy)),
    };
  }

  private async pickFreeProxyId(): Promise<string> {
    await this.reclaimExpiredCooldowns();

    const [allProxies, busyAssignments] = await Promise.all([
      this.webshare.listProxies(),
      this.proxyAssignmentModel.find({
        status: { $in: ['active', 'cooldown'] },
      }),
    ]);

    const busyIds = new Set(busyAssignments.map((a) => a.proxyId));
    const available = allProxies.filter((p) => !busyIds.has(p.id));

    if (available.length === 0) {
      throw new ServiceUnavailableException({
        code: 'E206',
        message: 'No proxy available — all proxies are in use or cooling down',
      });
    }

    const proxy = available[0];
    return proxy.id;
  }
}
