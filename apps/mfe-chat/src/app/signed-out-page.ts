import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Standalone mode only: this app has no sign-in form of its own. */
@Component({
  selector: 'chat-signed-out-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="mx-auto flex max-w-sm flex-col gap-2 rounded-xl border bg-card p-6 text-sm"
      data-testid="standalone-signed-out"
    >
      <h1 class="font-semibold">Not signed in</h1>
      <p class="text-muted-foreground">
        The chat app running on its own uses the session of the main app. Sign
        in there, then reload this page.
      </p>
      <a
        class="text-primary underline-offset-4 hover:underline"
        href="http://localhost:4200/auth/login"
        >Open the sign-in page</a
      >
    </section>
  `,
})
export class SignedOutPage {}
