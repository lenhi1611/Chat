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
  selectNickname,
} from '@realtime-chat/chat-data-access';
import {
  ZardBadgeComponent,
  type ZardBadgeTypeVariants,
} from '@realtime-chat/ui';

const STATUS_VIEW: Record<
  ConnectionStatus,
  { label: string; type: ZardBadgeTypeVariants }
> = {
  idle: { label: 'Chưa kết nối', type: 'secondary' },
  connecting: { label: 'Đang kết nối…', type: 'secondary' },
  open: { label: 'Đã kết nối', type: 'default' },
  reconnecting: { label: 'Đang kết nối lại…', type: 'destructive' },
  closed: { label: 'Đã ngắt kết nối', type: 'outline' },
};

/** Header badge: live WebSocket status and the nickname given by the server. */
@Component({
  selector: 'app-connection-badge',
  imports: [ZardBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="flex items-center gap-2 text-sm">
      @if (nickname(); as name) {
        <span class="text-muted-foreground" data-testid="nickname">{{
          name
        }}</span>
      }
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
  protected readonly nickname = this.store.selectSignal(selectNickname);
  protected readonly view = computed(() => STATUS_VIEW[this.status()]);
}
