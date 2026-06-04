import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { XConnection, XConnectionDocument } from '../schemas/x-connection.schema';
import { TokenCryptoService } from '../crypto/token-crypto.service';
import { WebhooksService } from '../webhooks/webhooks.service';

@Injectable()
export class ConnectionsService {
  constructor(
    @InjectModel(XConnection.name)
    private readonly connectionModel: Model<XConnectionDocument>,
    private readonly webhooksService: WebhooksService,
    private readonly tokenCrypto: TokenCryptoService,
  ) {}

  async listForOrg(orgId: string) {
    const connections = await this.connectionModel
      .find({
        orgId: new Types.ObjectId(orgId),
        revokedAt: null,
      })
      .sort({ connectedAt: -1 });

    const webhookByConnection =
      await this.webhooksService.getWebhookMetadataByConnectionIds(
        connections.map((c) => c._id),
      );

    return connections.map((c) => {
      const webhook = webhookByConnection.get(c._id.toString());
      return {
        id: c._id.toString(),
        xUserId: c.xUserId,
        xUsername: c.xUsername,
        scopes: c.scopes,
        connectedAt: c.connectedAt,
        tokenExpiresAt: c.tokenExpiresAt,
        webhookUrl: webhook?.webhookUrl ?? this.webhooksService.getSharedWebhookUrl(),
        subscribed: webhook?.subscribed ?? false,
        hasAuthToken: Boolean(c.authTokenEnc),
      };
    });
  }

  async setAuthToken(orgId: string, connectionId: string, authToken: string) {
    const connection = await this.connectionModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(connectionId),
        orgId: new Types.ObjectId(orgId),
        revokedAt: null,
      },
      {
        $set: {
          authTokenEnc: this.tokenCrypto.encrypt(authToken),
        },
      },
      { returnDocument: 'after' },
    );
    if (!connection) {
      throw new NotFoundException('Connection not found');
    }
    return { updated: true, hasAuthToken: true };
  }

  async revoke(orgId: string, connectionId: string) {
    const connection = await this.connectionModel.findOne({
      _id: new Types.ObjectId(connectionId),
      orgId: new Types.ObjectId(orgId),
      revokedAt: null,
    });
    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    await this.webhooksService.revokeForConnection(connection);
    connection.revokedAt = new Date();
    await connection.save();
    return { revoked: true };
  }
}
