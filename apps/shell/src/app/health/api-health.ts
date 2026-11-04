import { httpResource } from '@angular/common/http';
import { API_PATHS, type HealthResponse } from '@realtime-chat/contracts';
import { environment } from '../../environments/environment';

/** Reactive `GET /api/health` request. Call inside an injection context. */
export function apiHealthResource() {
  return httpResource<HealthResponse>(
    () => `${environment.apiBaseUrl}/${API_PATHS.health}`,
  );
}
