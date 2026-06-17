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
    findByIdAndUpdate: jest.fn(),
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
    expect(result.id).toBe(orgId.toString());
  });

  it('rejects creating a second organization for the same user', async () => {
    membershipModel.exists.mockResolvedValueOnce({ _id: new Types.ObjectId() });

    await expect(
      service.create(userId.toString(), { name: 'Another Org' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updatePrompt saves draft only', async () => {
    orgModel.findByIdAndUpdate.mockResolvedValue({
      _id: orgId,
      name: 'Acme Corp',
      createdBy: userId,
      systemPrompt: 'Published text',
      draftSystemPrompt: 'Draft text',
    });

    const result = await service.updatePrompt(orgId.toString(), {
      systemPrompt: 'Draft text',
    });

    expect(orgModel.findByIdAndUpdate).toHaveBeenCalledWith(
      orgId.toString(),
      { $set: { draftSystemPrompt: 'Draft text' } },
      { returnDocument: 'after' },
    );
    expect(result.hasUnpublishedDraft).toBe(true);
    expect(result.systemPrompt).toBe('Published text');
    expect(result.draftSystemPrompt).toBe('Draft text');
  });

  it('publishPrompt copies draft to systemPrompt', async () => {
    orgModel.findById.mockResolvedValue({
      _id: orgId,
      name: 'Acme Corp',
      createdBy: userId,
      systemPrompt: 'Old published',
      draftSystemPrompt: 'New draft',
    });
    orgModel.findByIdAndUpdate.mockResolvedValue({
      _id: orgId,
      name: 'Acme Corp',
      createdBy: userId,
      systemPrompt: 'New draft',
      draftSystemPrompt: 'New draft',
      promptPublishedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.publishPrompt(orgId.toString());

    expect(orgModel.findByIdAndUpdate).toHaveBeenCalledWith(
      orgId.toString(),
      {
        $set: {
          systemPrompt: 'New draft',
          llmModel: 'google/gemini-3.5-flash',
          promptPublishedAt: expect.any(Date),
        },
      },
      { returnDocument: 'after' },
    );
    expect(result.systemPrompt).toBe('New draft');
    expect(result.hasUnpublishedDraft).toBe(false);
  });

  it('publishPrompt rejects when no draft was saved', async () => {
    orgModel.findById.mockResolvedValue({
      _id: orgId,
      systemPrompt: 'Published only',
    });

    await expect(service.publishPrompt(orgId.toString())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('discardDraft resets draft to published prompt', async () => {
    orgModel.findById.mockResolvedValue({
      _id: orgId,
      systemPrompt: 'Published text',
      draftSystemPrompt: 'Changed draft',
      createdBy: userId,
    });
    orgModel.findByIdAndUpdate.mockResolvedValue({
      _id: orgId,
      systemPrompt: 'Published text',
      draftSystemPrompt: 'Published text',
      createdBy: userId,
    });

    const result = await service.discardDraft(orgId.toString());

    expect(orgModel.findByIdAndUpdate).toHaveBeenCalledWith(
      orgId.toString(),
      {
        $set: {
          draftSystemPrompt: 'Published text',
          draftLlmModel: 'google/gemini-3.5-flash',
        },
      },
      { returnDocument: 'after' },
    );
    expect(result.hasUnpublishedDraft).toBe(false);
  });

  it('testChat prefers explicit draft over published prompt', async () => {
    orgModel.findById.mockResolvedValue({
      _id: orgId,
      systemPrompt: 'Published prompt',
      draftSystemPrompt: 'Saved draft',
    });
    mockLlm.generateReply.mockResolvedValue({
      replyText: 'Yes, Noah supports Solana.',
      isKnownAnswer: true,
    });

    await service.testChat(orgId.toString(), {
      userMessage: 'Which chains?',
      systemPrompt: 'Override draft',
    });

    expect(mockLlm.generateReply).toHaveBeenCalledWith({
      systemPrompt: 'Override draft',
      userMessage: 'Which chains?',
      model: 'google/gemini-3.5-flash',
    });
  });

  it('testChat falls back to saved draft then published prompt', async () => {
    orgModel.findById.mockResolvedValue({
      _id: orgId,
      systemPrompt: 'Published prompt',
      draftSystemPrompt: 'Saved draft',
    });
    mockLlm.generateReply.mockResolvedValue({
      replyText: 'Hello!',
      isKnownAnswer: true,
    });

    await service.testChat(orgId.toString(), { userMessage: 'Hi' });

    expect(mockLlm.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'Saved draft',
        userMessage: 'Hi',
        model: 'google/gemini-3.5-flash',
      }),
    );
  });

  it('updatePrompt saves draft llmModel', async () => {
    orgModel.findByIdAndUpdate.mockResolvedValue({
      _id: orgId,
      name: 'Acme Corp',
      createdBy: userId,
      llmModel: 'google/gemini-3.5-flash',
      draftLlmModel: 'openai/gpt-4o-mini',
    });

    await service.updatePrompt(orgId.toString(), {
      llmModel: 'openai/gpt-4o-mini',
    });

    expect(orgModel.findByIdAndUpdate).toHaveBeenCalledWith(
      orgId.toString(),
      { $set: { draftLlmModel: 'openai/gpt-4o-mini' } },
      { returnDocument: 'after' },
    );
  });

  it('testChat rejects when no prompt is available', async () => {
    orgModel.findById.mockResolvedValue({
      _id: orgId,
    });

    await expect(
      service.testChat(orgId.toString(), { userMessage: 'Hi' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
