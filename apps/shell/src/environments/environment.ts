// Production build. Swapped for environment.development.ts in development
// (see fileReplacements in project.json). The single place for backend URLs.
export const environment = {
  production: true,
  apiBaseUrl: 'http://localhost:3000/api',
};
