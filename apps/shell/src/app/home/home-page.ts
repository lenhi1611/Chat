import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
} from '@realtime-chat/ui';
import { apiHealthResource } from '../health/api-health';

@Component({
  selector: 'app-home-page',
  imports: [
    RouterLink,
    ZardButtonComponent,
    ZardBadgeComponent,
    ZardCardImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.html',
})
export class HomePage {
  protected readonly health = apiHealthResource();

  protected readonly apiStatus = computed(() => {
    if (this.health.isLoading())
      return { label: 'Đang kiểm tra…', type: 'secondary' } as const;
    if (this.health.error())
      return { label: 'Không kết nối được', type: 'destructive' } as const;
    return {
      label: this.health.value()?.status ?? 'unknown',
      type: 'default',
    } as const;
  });

  protected readonly apiResponse = computed(() =>
    this.health.hasValue() ? JSON.stringify(this.health.value()) : null,
  );
}
