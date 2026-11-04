import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-remote-unavailable',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section role="alert">
      <h2>Không tải được mô-đun "{{ remoteName() }}"</h2>
      <p>
        Micro-frontend này hiện không phản hồi. Phần còn lại của ứng dụng vẫn
        hoạt động bình thường.
      </p>
      <button type="button" (click)="retry()">Thử lại</button>
    </section>
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
