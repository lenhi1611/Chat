import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  ZardAvatarComponent,
  ZardBadgeComponent,
  ZardCardImports,
} from '@realtime-chat/ui';

@Component({
  selector: 'chat-home',
  imports: [ZardCardImports, ZardAvatarComponent, ZardBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-card class="max-w-md" data-testid="chat-mfe-card">
      <z-card-header>
        <z-card-title zTitle="Chat MFE loaded" />
        <z-card-description
          zDescription="Remote mfe-chat served from port 4202."
        />
      </z-card-header>
      <z-card-content class="flex items-center gap-3">
        <z-avatar zFallback="RC" zSize="lg" zAlt="Realtime Chat" />
        <div class="flex flex-col gap-1">
          <span class="text-sm font-medium">Realtime Chat</span>
          <z-badge zType="secondary">Native Federation</z-badge>
        </div>
      </z-card-content>
    </z-card>
  `,
})
export class ChatHome {}
