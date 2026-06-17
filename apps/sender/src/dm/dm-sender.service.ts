import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GetxapiService } from '@app/getxapi';
import type { XDmReplyReadyEvent } from '@app/shared';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import {
  XConnection,
  XConnectionDocument,
} from '../schemas/x-connection.schema';

@Injectable()
export class DmSenderService {
  private readonly logger = new Logger(DmSenderService.name);

  constructor(
    @InjectModel(XConnection.name)
    private readonly connectionModel: Model<XConnectionDocument>,
    private readonly tokenCrypto: TokenCryptoService,
    private readonly getxapi: GetxapiService,
  ) {}

  async handleReplyReady(event: XDmReplyReadyEvent): Promise<void> {
    this.logger.log(
      `Sending DM reply eventId=${event.eventId} sourceEventId=${event.sourceEventId} ` +
        `conversation=${event.conversationId} recipient=${event.recipientId}`,
    );

    const connection = await this.connectionModel.findOne({
      _id: new Types.ObjectId(event.connectionId),
      orgId: new Types.ObjectId(event.orgId),
      revokedAt: null,
    });
    if (!connection) {
      this.logger.warn(
        `Connection ${event.connectionId} not found for reply event ${event.eventId}`,
      );
      return;
    }

    if (!connection.authTokenEnc) {
      this.logger.warn(
        `Connection ${event.connectionId} missing authTokenEnc; cannot send DM`,
      );
      return;
    }

    const authToken = this.tokenCrypto.decrypt(connection.authTokenEnc);
    const proxy = connection.proxyUrlEnc
      ? this.tokenCrypto.decrypt(connection.proxyUrlEnc)
      : undefined;
    const result = await this.getxapi.sendDm({
      authToken,
      recipientId: event.recipientId,
      text: event.replyText,
      proxy,
    });

    this.logger.log(
      `DM sent eventId=${event.eventId} messageId=${result.data?.id ?? 'unknown'} ` +
        `to=${event.recipientId}: ${JSON.stringify(event.replyText)}`,
    );
  }
}
