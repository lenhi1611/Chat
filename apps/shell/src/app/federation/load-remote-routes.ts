import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { REMOTE_LOADER } from './remote-loader';

/**
 * `loadChildren` factory for a remote that exposes a `Routes` array.
 * If the remote is down or broken, the shell renders a friendly error page
 * instead of failing navigation (and leaving a blank screen).
 */
export function loadRemoteRoutes(
  remoteName: string,
  exposedModule: string,
  exportName: string,
): () => Promise<Routes> {
  return () => {
    const loadRemote = inject(REMOTE_LOADER);
    return loadRemote<Record<string, Routes>>(remoteName, exposedModule)
      .then((module) => {
        const routes = module[exportName];
        if (!Array.isArray(routes)) {
          throw new Error(
            `Remote "${remoteName}" (${exposedModule}) has no "${exportName}" routes export.`,
          );
        }
        return routes;
      })
      .catch((error: unknown) => {
        console.error(`[shell] Failed to load remote "${remoteName}"`, error);
        return [
          {
            path: '**',
            loadComponent: () =>
              import('./remote-unavailable').then((m) => m.RemoteUnavailable),
            data: { remoteName },
          },
        ];
      });
  };
}
