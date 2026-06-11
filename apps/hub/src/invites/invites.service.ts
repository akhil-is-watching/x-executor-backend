import {
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HUB_API_PREFIX } from '@app/shared';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateInviteDto } from './dto/create-invite.dto';
import { Invite, InviteDocument } from '../schemas/invite.schema';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import { generateOpaqueToken } from '../crypto/pkce.util';

@Injectable()
export class InvitesService {
  constructor(
    @InjectModel(Invite.name)
    private readonly inviteModel: Model<InviteDocument>,
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
    private readonly config: ConfigService,
  ) {}

  async create(orgId: string, userId: string, dto: CreateInviteDto) {
    const hours = dto.expiresInHours ?? 168;
    const token = generateOpaqueToken();
    const invite = await this.inviteModel.create({
      orgId: new Types.ObjectId(orgId),
      token,
      createdBy: new Types.ObjectId(userId),
      expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
      maxUses: dto.maxUses,
      useCount: 0,
    });

    return {
      id: invite._id.toString(),
      inviteToken: invite.token,
      inviteUrl: this.buildInviteUrl(invite.token),
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
    };
  }

  async listForOrg(orgId: string) {
    const invites = await this.inviteModel
      .find({ orgId: new Types.ObjectId(orgId), revokedAt: null })
      .sort({ createdAt: -1 });

    return invites.map((invite) => ({
      id: invite._id.toString(),
      inviteToken: invite.token,
      inviteUrl: this.buildInviteUrl(invite.token),
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      useCount: invite.useCount,
      expired: this.isExpired(invite),
      createdAt: (invite as InviteDocument & { createdAt?: Date }).createdAt,
    }));
  }

  async revoke(orgId: string, inviteId: string) {
    const invite = await this.inviteModel.findOne({
      _id: new Types.ObjectId(inviteId),
      orgId: new Types.ObjectId(orgId),
    });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    invite.revokedAt = new Date();
    await invite.save();
    return { revoked: true };
  }

  async getPublicMetadata(token: string) {
    const invite = await this.inviteModel.findOne({ token });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    const org = await this.orgModel.findById(invite.orgId);
    return {
      orgName: org?.name ?? 'Unknown',
      expired: this.isExpired(invite),
      revoked: Boolean(invite.revokedAt),
      maxUsesReached: this.isMaxUsesReached(invite),
      useCount: invite.useCount,
      maxUses: invite.maxUses ?? null,
    };
  }

  async findValidInviteByToken(token: string): Promise<InviteDocument> {
    const invite = await this.inviteModel.findOne({ token });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.revokedAt) {
      throw new GoneException('Invite has been revoked');
    }
    if (this.isExpired(invite)) {
      throw new GoneException('Invite has expired');
    }
    if (this.isMaxUsesReached(invite)) {
      throw new GoneException('Invite has reached maximum uses');
    }
    return invite;
  }

  async incrementUseCount(inviteId: Types.ObjectId): Promise<void> {
    await this.inviteModel.updateOne(
      { _id: inviteId },
      { $inc: { useCount: 1 } },
    );
  }

  isExpired(invite: InviteDocument): boolean {
    return invite.expiresAt.getTime() < Date.now();
  }

  isMaxUsesReached(invite: InviteDocument): boolean {
    return (
      invite.maxUses !== undefined &&
      invite.maxUses !== null &&
      invite.useCount >= invite.maxUses
    );
  }

  private buildInviteUrl(token: string): string {
    const base = this.config.getOrThrow<string>('HUB_PUBLIC_BASE_URL').replace(
      /\/$/,
      '',
    );
    return `${base}/${HUB_API_PREFIX}/oauth/x/start?invite=${encodeURIComponent(token)}`;
  }
}
