import { bootstrapApplication } from '@angular/platform-browser';
import { mergeApplicationConfig } from '@angular/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { REMOTE_LOADER, RemoteLoader } from './app/federation/remote-loader';

export function bootstrap(remoteLoader: RemoteLoader) {
  return bootstrapApplication(
    App,
    mergeApplicationConfig(appConfig, {
      providers: [{ provide: REMOTE_LOADER, useValue: remoteLoader }],
    }),
  );
}
