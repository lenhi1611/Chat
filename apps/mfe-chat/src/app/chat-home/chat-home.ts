import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'chat-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>Chat MFE loaded</p>`,
})
export class ChatHome {}
