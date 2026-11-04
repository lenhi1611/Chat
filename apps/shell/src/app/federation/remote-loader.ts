import { InjectionToken } from '@angular/core';

/** Loads an exposed module from a federated remote (see federation.manifest.json). */
export type RemoteLoader = <T = unknown>(
  remoteName: string,
  exposedModule: string,
) => Promise<T>;

export const REMOTE_LOADER = new InjectionToken<RemoteLoader>('REMOTE_LOADER');

/** Used when federation could not be initialised at all (e.g. manifest missing). */
export const unavailableRemoteLoader: RemoteLoader = (remoteName) =>
  Promise.reject(
    new Error(
      `Native Federation is not initialised; cannot load "${remoteName}".`,
    ),
  );
