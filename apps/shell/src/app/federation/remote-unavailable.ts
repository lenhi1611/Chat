import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ZardButtonComponent, ZardCardImports } from '@realtime-chat/ui';

@Component({
  selector: 'app-remote-unavailable',
  imports: [RouterLink, ZardButtonComponent, ZardCardImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-card class="max-w-md" role="alert" data-testid="remote-unavailable">
      <z-card-header>
        <z-card-title
          [zTitle]="'Không tải được mô-đun &quot;' + remoteName() + '&quot;'"
        />
        <z-card-description
          zDescription="Micro-frontend này hiện không phản hồi. Phần còn lại của ứng dụng vẫn hoạt động bình thường."
        />
      </z-card-header>
      <z-card-footer class="gap-2">
        <button z-button type="button" (click)="retry()">Thử lại</button>
        <a z-button zType="outline" routerLink="/">Về trang chủ</a>
      </z-card-footer>
    </z-card>
  `,
})
export class RemoteUnavailable {
  /** Bound from route `data` (withComponentInputBinding). */
  readonly remoteName = input('remote');

  protected retry(): void {
    // Remote entries are resolved once during initFederation, so a reload is
    // the reliable way to pick up a remote that has come back online.
    window.location.reload();
  }
}
