import { initFederation } from '@angular-architects/native-federation';

// Remote: no manifest of its own. Initialising federation lets it reuse the
// shared Angular packages when it runs standalone on :4202.
initFederation(
  {},
  {
    hostRemoteEntry: { url: './remoteEntry.json' },
  },
)
  .catch((err) => console.error(err))
  .then(() => import('./bootstrap'))
  .catch((err) => console.error(err));
