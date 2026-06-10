import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HUB_HEALTH_PATH } from '@app/shared';
import { HealthResponseDto } from './common/dto/health-response.dto';

@ApiTags('Health')
@Controller(HUB_HEALTH_PATH)
export class HubController {
  @Get()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, type: HealthResponseDto })
  health() {
    return { status: 'ok' };
  }
}
