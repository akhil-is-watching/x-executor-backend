import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCampaignDto } from './create-campaign.dto';

describe('CreateCampaignDto', () => {
  it('allows connectionIds when validating with whitelist', async () => {
    const dto = plainToInstance(CreateCampaignDto, {
      name: 'Q1 outreach',
      targetUsernames: ['alice'],
      messageText: 'Hello',
      connectionIds: ['507f1f77bcf86cd799439011'],
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
  });
});
