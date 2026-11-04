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

    // Phase 1: add state management + rxjs here with the same `singleton`
    // config, e.g.
    //   rxjs: singleton,
    //   '@ngrx/store': singleton,
    //   '@ngrx/effects': singleton,
    //   '@ngrx/signals': singleton,
    //
    // No realtime client library needs sharing: the browser side talks to the
    // gateway through the native WebSocket API.
  });

// Workspace libraries (@realtime-chat/*) from tsconfig.base.json `paths` are
// shared automatically by Native Federation (default `sharedMappings`), so
// shell and remotes get a single instance of @realtime-chat/ui.

export const skip = [
  'rxjs/ajax',
  'rxjs/fetch',
  'rxjs/testing',
  'rxjs/webSocket',
];

export const features = {
  denseChunking: true,
  denseExternals: true,
  strictImports: false,
};
