import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LlmService } from '@app/llm';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { ChatTestDto } from './dto/chat-test.dto';
import { UpdateOrganizationPromptDto } from './dto/update-organization-prompt.dto';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import {
  OrganizationMembership,
  OrganizationMembershipDocument,
  OrgRole,
} from '../schemas/organization-membership.schema';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
    @InjectModel(OrganizationMembership.name)
    private readonly membershipModel: Model<OrganizationMembershipDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly llm: LlmService,
    private readonly config: ConfigService,
  ) {}

  async create(userId: string, dto: CreateOrganizationDto) {
    await this.assertUserHasNoOrganization(userId);

    const org = await this.orgModel.create({
      name: dto.name,
      slug: dto.slug,
      createdBy: new Types.ObjectId(userId),
    });

    await this.membershipModel.create({
      orgId: org._id,
      userId: new Types.ObjectId(userId),
      role: OrgRole.Owner,
    });

    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $set: { orgId: org._id.toString() } },
    );

    return this.toOrgResponse(org);
  }

  private async assertUserHasNoOrganization(userId: string): Promise<void> {
    const existing = await this.membershipModel.exists({
      userId: new Types.ObjectId(userId),
    });
    if (existing) {
      throw new ConflictException('User already belongs to an organization');
    }
  }

  async listForUser(userId: string) {
    const memberships = await this.membershipModel.find({
      userId: new Types.ObjectId(userId),
    });
    const orgIds = memberships.map((m) => m.orgId);
    const orgs = await this.orgModel.find({ _id: { $in: orgIds } });
    const roleByOrg = new Map(
      memberships.map((m) => [m.orgId.toString(), m.role]),
    );

    return orgs.map((org) => ({
      ...this.toOrgResponse(org),
      role: roleByOrg.get(org._id.toString()),
    }));
  }

  async getById(orgId: string) {
    const org = await this.orgModel.findById(orgId);
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return this.toOrgResponse(org);
  }

  async updatePrompt(orgId: string, dto: UpdateOrganizationPromptDto) {
    const org = await this.orgModel.findByIdAndUpdate(
      orgId,
      {
        $set: {
          ...(dto.systemPrompt !== undefined
            ? { systemPrompt: dto.systemPrompt }
            : {}),
          ...(dto.unknownReply !== undefined
            ? { unknownReply: dto.unknownReply }
            : {}),
        },
      },
      { returnDocument: 'after' },
    );
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return this.toOrgResponse(org);
  }

  async testChat(orgId: string, dto: ChatTestDto) {
    const org = await this.orgModel.findById(orgId);
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const systemPrompt = dto.systemPrompt?.trim() ?? org.systemPrompt?.trim();
    if (!systemPrompt) {
      throw new BadRequestException(
        'systemPrompt is required when the organization has no saved system prompt',
      );
    }

    const unknownReply =
      dto.unknownReply?.trim() ??
      org.unknownReply?.trim() ??
      this.config.get<string>('DEFAULT_UNKNOWN_REPLY') ??
      "I don't know";

    const result = await this.llm.generateReply({
      systemPrompt,
      unknownReply,
      userMessage: dto.userMessage.trim(),
    });

    return {
      reply: result.replyText,
      isKnownAnswer: result.isKnownAnswer,
    };
  }

  async listMembers(orgId: string) {
    const memberships = await this.membershipModel.find({
      orgId: new Types.ObjectId(orgId),
    });
    const userIds = memberships.map((m) => m.userId);
    const users = await this.userModel.find({ _id: { $in: userIds } });
    const emailById = new Map(users.map((u) => [u._id.toString(), u.email]));

    return memberships.map((m) => ({
      userId: m.userId.toString(),
      email: emailById.get(m.userId.toString()),
      role: m.role,
      joinedAt: (m as OrganizationMembershipDocument & { createdAt?: Date })
        .createdAt,
    }));
  }

  private toOrgResponse(org: OrganizationDocument) {
    return {
      id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      systemPrompt: org.systemPrompt,
      unknownReply: org.unknownReply,
      createdBy: org.createdBy.toString(),
      createdAt: (org as OrganizationDocument & { createdAt?: Date }).createdAt,
    };
  }
}
