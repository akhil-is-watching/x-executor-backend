import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GetxapiService } from '@app/getxapi';
import type { XDmHandoffNotifyEvent } from '@app/shared';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import {
  XConnection,
  XConnectionDocument,
} from '../schemas/x-connection.schema';

@Injectable()
export class HandoffNotifySenderService {
  private readonly logger = new Logger(HandoffNotifySenderService.name);

  constructor(
    @InjectModel(XConnection.name)
    private readonly connectionModel: Model<XConnectionDocument>,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly getxapi: GetxapiService,
  ) {}

  async handleHandoffNotify(event: XDmHandoffNotifyEvent): Promise<void> {
    this.logger.log(
      `Sending handoff notify conversation=${event.conversationId} ` +
        `notifyHandle=${event.notifyHandle}`,
    );

    const connection = await this.connectionModel.findOne({
      _id: new Types.ObjectId(event.connectionId),
      orgId: new Types.ObjectId(event.orgId),
      revokedAt: null,
    });

    if (!connection?.authTokenEnc) {
      this.logger.warn(
        `Connection ${event.connectionId} missing or has no auth token; cannot notify agent`,
      );
      return;
    }

    const authToken = this.tokenCrypto.decrypt(connection.authTokenEnc);
    const proxy = connection.proxyUrlEnc
      ? this.tokenCrypto.decrypt(connection.proxyUrlEnc)
      : undefined;
    const recipientUsername = event.notifyHandle.replace(/^@/, '');
    const categoryLine = event.category
      ? `Handoff alert — ${event.category}`
      : 'Handoff alert';
    const text = [
      categoryLine,
      `${event.userHandle} sent: "${event.userMessage}"`,
      `Conversation: ${event.conversationId}`,
      `Triggered at: ${event.triggeredAt}`,
    ].join('\n');

    const result = await this.getxapi.sendDm({
      authToken,
      recipientUsername,
      text,
      proxy,
    });

    this.logger.log(
      `Handoff notify sent to @${recipientUsername} messageId=${result.data?.id ?? 'unknown'}`,
    );
  }
}
