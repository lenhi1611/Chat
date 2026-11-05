// Production build. Swapped for environment.development.ts in development
// (see fileReplacements in project.json). The single place for backend URLs.
export const environment = {
  production: true,
  apiBaseUrl: 'http://localhost:3000/api',
  // Same as development for now: split dev/prod values once a real
  // deployment exists (see README).
  wsUrl: 'ws://localhost:3000/ws',
};
