import nx from '@nx/eslint-plugin';
import prettier from 'eslint-config-prettier/flat';

/**
 * Module boundaries (tags are set in each project.json):
 *
 *   scope:shell | scope:mfe | scope:api | scope:shared | scope:e2e   owner
 *   type:app | type:lib | type:e2e                       apps are never imported
 *   platform:angular | platform:node | platform:any       where the code runs
 *   domain:auth | domain:chat | domain:infra | domain:shared   backend (libs/api/*)
 *   access:public | access:shell-only                     who may import a shared lib
 *
 * - shell and mfe-* apps may only import shared libs; mfe-* never import each
 *   other nor the shell (each MFE is deployed independently).
 * - mfe-* may only import shared libs tagged access:public, directly. The
 *   socket lib is access:shell-only: remotes reach the connection through the
 *   chat-data-access store, never by injecting the socket themselves.
 *   (A direct-import allowlist, not `notDependOnLibsWithTags`: that rule also
 *   follows transitive dependencies, and chat-data-access must use the socket.)
 * - api (NestJS) may import platform-agnostic shared libs (contracts) and the
 *   libs/api/* backend libs. Browser code (scope:mfe, scope:shared) never
 *   imports libs/api/*.
 * - Backend domains are isolated: domain:auth and domain:chat may only import
 *   contracts, domain:infra (Redis…) and domain:shared (libs/api/messaging:
 *   RabbitMQ, e.g. the EventPublisher port), never each other.
 * - shared/contracts (platform:any) depends on no other project and on no
 *   framework package, so it compiles for both the browser and Node.
 */
const depConstraints = [
  // --- scope ---------------------------------------------------------------
  { sourceTag: 'scope:shell', onlyDependOnLibsWithTags: ['scope:shared'] },
  { sourceTag: 'scope:mfe', onlyDependOnLibsWithTags: ['scope:shared'] },
  { sourceTag: 'scope:mfe', onlyDependOnLibsWithTags: ['access:public'] },
  {
    sourceTag: 'scope:api',
    onlyDependOnLibsWithTags: ['scope:shared', 'scope:api'],
  },
  { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
  // e2e drives the running apps; it may share the protocol types only.
  { sourceTag: 'scope:e2e', onlyDependOnLibsWithTags: ['platform:any'] },

  // --- type ----------------------------------------------------------------
  { sourceTag: 'type:lib', onlyDependOnLibsWithTags: ['type:lib'] },

  // --- platform ------------------------------------------------------------
  {
    sourceTag: 'platform:angular',
    onlyDependOnLibsWithTags: ['platform:angular', 'platform:any'],
    bannedExternalImports: ['@nestjs/*', 'express'],
  },
  {
    sourceTag: 'platform:node',
    onlyDependOnLibsWithTags: ['platform:any', 'platform:node'],
    bannedExternalImports: ['@angular/*', '@ngrx/*'],
  },
  {
    sourceTag: 'platform:any',
    onlyDependOnLibsWithTags: [],
    bannedExternalImports: [
      '@angular/*',
      '@nestjs/*',
      '@ngrx/*',
      'rxjs',
      'rxjs/*',
      'express',
      'ws',
    ],
  },

  // --- backend domains (libs/api/*) -----------------------------------------
  {
    sourceTag: 'domain:auth',
    onlyDependOnLibsWithTags: [
      'platform:any',
      'domain:infra',
      'domain:shared',
      // its own domain: the auth-service app imports libs/api/auth
      'domain:auth',
    ],
  },
  {
    sourceTag: 'domain:chat',
    onlyDependOnLibsWithTags: [
      'platform:any',
      'domain:infra',
      'domain:shared',
      // its own domain: the chat-service app imports libs/api/chat
      'domain:chat',
    ],
  },
  { sourceTag: 'domain:infra', onlyDependOnLibsWithTags: ['platform:any'] },
  // RabbitMQ plumbing (libs/api/messaging), shared by the backend apps.
  { sourceTag: 'domain:shared', onlyDependOnLibsWithTags: ['platform:any'] },
];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/vitest.config.*.timestamp*',
      // Prisma clients (generated, git-ignored)
      'libs/api/*/src/generated/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [
            '^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$',
            // Database/Redis test tooling (Prisma configs, Vitest setup).
            '^(\\.\\./)+tools/db/[a-z-]+\\.mjs$',
          ],
          depConstraints,
        },
      ],
    },
  },
  // Must stay last: turns off stylistic rules that would fight with Prettier.
  prettier,
];
