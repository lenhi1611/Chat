import { Controller, Get } from '@nestjs/common';
import { API_PATHS, type HealthResponse } from '@realtime-chat/contracts';
import { Public } from '../auth/public.decorator';

/** Liveness probe: public, no token. */
@Public()
@Controller(API_PATHS.health)
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
