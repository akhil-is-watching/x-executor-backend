import { BadRequestException, ConflictException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { LlmService } from '@app/llm';
import { OrgRole } from '../schemas/organization-membership.schema';
import { OrganizationsService } from './organizations.service';
import { Organization } from '../schemas/organization.schema';
import { OrganizationMembership } from '../schemas/organization-membership.schema';
import { User } from '../schemas/user.schema';

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  const userId = new Types.ObjectId();
  const orgId = new Types.ObjectId();

  const mockLlm = { generateReply: jest.fn() };

  const orgModel = {
    create: jest.fn().mockResolvedValue({
      _id: orgId,
      name: 'Acme Corp',
      createdBy: userId,
    }),
    findById: jest.fn(),
  };

  const membershipModel = {
    exists: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    find: jest.fn(),
  };

  const userModel = {
    updateOne: jest.fn().mockResolvedValue({}),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    membershipModel.exists.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: getModelToken(Organization.name), useValue: orgModel },
        {
          provide: getModelToken(OrganizationMembership.name),
          useValue: membershipModel,
        },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: LlmService, useValue: mockLlm },
      ],
    }).compile();

    service = module.get(OrganizationsService);
  });

  it('creates an organization and updates user orgId', async () => {
    const result = await service.create(userId.toString(), { name: 'Acme Corp' });

    expect(membershipModel.exists).toHaveBeenCalled();
    expect(orgModel.create).toHaveBeenCalled();
    expect(membershipModel.create).toHaveBeenCalledWith({
      orgId,
      userId,
      role: OrgRole.Owner,
    });
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      { $set: { orgId: orgId.toString() } },
    );
    expect(result.id).toBe(orgId.toString());
  });

  it('rejects creating a second organization for the same user', async () => {
    membershipModel.exists.mockResolvedValueOnce({ _id: new Types.ObjectId() });

    await expect(
      service.create(userId.toString(), { name: 'Another Org' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(orgModel.create).not.toHaveBeenCalled();
  });

  it('testChat uses draft prompt and returns LLM reply', async () => {
    orgModel.findById.mockResolvedValue({
      _id: orgId,
      systemPrompt: 'Saved prompt',
    });
    mockLlm.generateReply.mockResolvedValue({
      replyText: 'Yes, Noah supports Solana.',
      isKnownAnswer: true,
    });

    const result = await service.testChat(orgId.toString(), {
      userMessage: 'Which chains?',
      systemPrompt: 'Noah supports Solana and Irys.',
    });

    expect(mockLlm.generateReply).toHaveBeenCalledWith({
      systemPrompt: 'Noah supports Solana and Irys.',
      userMessage: 'Which chains?',
    });
    expect(result).toEqual({
      reply: 'Yes, Noah supports Solana.',
      isKnownAnswer: true,
    });
  });

  it('testChat falls back to org prompt when draft omitted', async () => {
    orgModel.findById.mockResolvedValue({
      _id: orgId,
      systemPrompt: 'Org prompt text',
    });
    mockLlm.generateReply.mockResolvedValue({
      replyText: 'Hello!',
      isKnownAnswer: true,
    });

    await service.testChat(orgId.toString(), { userMessage: 'Hi' });

    expect(mockLlm.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'Org prompt text',
        userMessage: 'Hi',
      }),
    );
  });

  it('testChat rejects when no draft and org has no systemPrompt', async () => {
    orgModel.findById.mockResolvedValue({
      _id: orgId,
      systemPrompt: undefined,
    });

    await expect(
      service.testChat(orgId.toString(), { userMessage: 'Hi' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockLlm.generateReply).not.toHaveBeenCalled();
  });
});
