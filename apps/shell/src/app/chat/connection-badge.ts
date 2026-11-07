import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Store } from '@ngrx/store';
import {
  type ConnectionStatus,
  selectConnectionStatus,
} from '@realtime-chat/chat-data-access';
import {
  ZardBadgeComponent,
  type ZardBadgeTypeVariants,
} from '@realtime-chat/ui';

const STATUS_VIEW: Record<
  ConnectionStatus,
  { label: string; type: ZardBadgeTypeVariants }
> = {
  idle: { label: 'Not connected', type: 'secondary' },
  connecting: { label: 'Connecting…', type: 'secondary' },
  open: { label: 'Connected', type: 'default' },
  reconnecting: { label: 'Reconnecting…', type: 'destructive' },
  closed: { label: 'Disconnected', type: 'outline' },
};

/** Header badge: live WebSocket status. */
@Component({
  selector: 'app-connection-badge',
  imports: [ZardBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="flex items-center gap-2 text-sm">
      <z-badge
        [zType]="view().type"
        [attr.data-status]="status()"
        data-testid="connection-status"
        role="status"
        aria-live="polite"
        >{{ view().label }}</z-badge
      >
    </span>
  `,
})
export class ConnectionBadge {
  private readonly store = inject(Store);

  protected readonly status = this.store.selectSignal(selectConnectionStatus);
  protected readonly view = computed(() => STATUS_VIEW[this.status()]);
}
