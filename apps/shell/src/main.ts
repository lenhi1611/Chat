import { initFederation } from '@angular-architects/native-federation';
import type { RemoteLoader } from './app/federation/remote-loader';

// Dynamic host: remotes come from federation.manifest.json at runtime.
// The shell must still boot if federation fails, so errors only downgrade
// remote loading (the /chat route then shows a friendly error page).
initFederation('federation.manifest.json', {
  hostRemoteEntry: { url: './remoteEntry.json' },
})
  .then((federation): RemoteLoader => federation.loadRemoteModule)
  .catch(async (err): Promise<RemoteLoader> => {
    console.error('[shell] Native Federation init failed', err);
    return (await import('./app/federation/remote-loader'))
      .unavailableRemoteLoader;
  })
  .then(async (remoteLoader) =>
    (await import('./bootstrap')).bootstrap(remoteLoader),
  )
  .catch((err) => console.error(err));
