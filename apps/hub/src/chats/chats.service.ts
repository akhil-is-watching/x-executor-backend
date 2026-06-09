import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DmMessage, DmMessageDocument } from '../schemas/dm-message.schema';

@Injectable()
export class ChatsService {
  constructor(
    @InjectModel(DmMessage.name)
    private readonly dmMessageModel: Model<DmMessageDocument>,
  ) {}

  async listConversations(orgId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const orgObjectId = new Types.ObjectId(orgId);

    const [data, totalResult] = await Promise.all([
      this.dmMessageModel.aggregate([
        { $match: { orgId: orgObjectId } },
        { $sort: { processedAt: -1 } },
        {
          $group: {
            _id: '$conversationId',
            conversationId: { $first: '$conversationId' },
            recipientId: { $first: '$recipientId' },
            recipientUsername: { $first: '$recipientUsername' },
            connectionId: { $first: '$connectionId' },
            xUsername: { $first: '$xUsername' },
            lastMessage: {
              $first: {
                direction: '$direction',
                text: '$text',
                processedAt: '$processedAt',
              },
            },
            messageCount: { $sum: 1 },
            lastActivity: { $max: '$processedAt' },
          },
        },
        { $sort: { lastActivity: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            lastActivity: 0,
          },
        },
      ]),
      this.dmMessageModel.aggregate([
        { $match: { orgId: orgObjectId } },
        { $group: { _id: '$conversationId' } },
        { $count: 'total' },
      ]),
    ]);

    return {
      data: data.map((conversation) => ({
        ...conversation,
        connectionId: conversation.connectionId?.toString(),
      })),
      total: totalResult[0]?.total ?? 0,
      page,
      limit,
    };
  }

  async getMessages(
    orgId: string,
    conversationId: string,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    const filter = {
      orgId: new Types.ObjectId(orgId),
      conversationId,
    };

    const [messages, total] = await Promise.all([
      this.dmMessageModel
        .find(filter)
        .sort({ processedAt: 1 })
        .skip(skip)
        .limit(limit)
        .select('direction text processedAt recipientId isKnownAnswer')
        .lean(),
      this.dmMessageModel.countDocuments(filter),
    ]);

    return {
      data: messages.map((message) => ({
        direction: message.direction,
        text: message.text,
        processedAt: message.processedAt,
        recipientId: message.recipientId,
        isKnownAnswer: message.isKnownAnswer ?? null,
      })),
      total,
      conversationId,
      page,
      limit,
    };
  }
}
