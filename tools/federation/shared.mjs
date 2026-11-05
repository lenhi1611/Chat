// Shared-dependency policy for every Native Federation app (host + remotes).
// Keep this list identical across apps: a package shared as a singleton by one
// app but bundled by another ends up loaded twice at runtime.
import { share } from '@angular-architects/native-federation/config';

const singleton = {
  singleton: true,
  strictVersion: true,
  requiredVersion: 'auto',
  includeSecondaries: { keepAll: true },
  build: 'package',
};

export const sharedPackages = () =>
  share({
    '@angular/core': singleton,
    '@angular/common': singleton,
    '@angular/router': singleton,
    '@angular/platform-browser': singleton,
    '@angular/forms': singleton,
    // Used by @realtime-chat/ui (zard/ui): both hold DI services/tokens
    // (Overlay, Directionality, icon registry) that must exist only once.
    '@angular/cdk': singleton,
    '@ng-icons/core': singleton,

    // State management. The shell owns the root Store, its effects and the
    // single WebSocket; remotes inject that Store and read its Observables.
    // Two copies of @ngrx/store would mean two `Store` DI tokens (the remote
    // could not find the shell's); two copies of rxjs would break
    // `instanceof Observable` and interop across the boundary.
    rxjs: singleton,
    '@ngrx/store': singleton,
    '@ngrx/effects': singleton,
    '@ngrx/entity': singleton,
    '@ngrx/store-devtools': singleton,

    // No realtime client library needs sharing: the browser side talks to the
    // gateway through the native WebSocket API.
  });

// Workspace libraries (@realtime-chat/*) from tsconfig.base.json `paths` are
// shared automatically by Native Federation (default `sharedMappings`), so
// shell and remotes get a single instance of @realtime-chat/ui,
// @realtime-chat/socket (one ChatSocketService, one connection) and
// @realtime-chat/chat-data-access (one set of actions/selectors/features).

export const skip = [
  'rxjs/ajax',
  'rxjs/fetch',
  'rxjs/testing',
  'rxjs/webSocket',
  // @angular/cdk secondaries that are not browser modules: schematics run in
  // Node, `*-prebuilt(.css)` are stylesheets.
  /^@angular\/cdk\/schematics/,
  /^@angular\/cdk\/.*-prebuilt(\.css)?$/,
];

export const features = {
  denseChunking: true,
  denseExternals: true,
  strictImports: false,
};
