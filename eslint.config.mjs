import nx from '@nx/eslint-plugin';
import prettier from 'eslint-config-prettier/flat';

/**
 * Module boundaries (tags are set in each project.json):
 *
 *   scope:shell | scope:mfe | scope:api | scope:shared   who owns the project
 *   type:app | type:lib                                   apps are never imported
 *   platform:angular | platform:node | platform:any       where the code runs
 *
 * - shell and mfe-* apps may only import shared libs; mfe-* never import each
 *   other nor the shell (each MFE is deployed independently).
 * - api (NestJS) may only import platform-agnostic shared libs, i.e. contracts.
 * - shared/contracts (platform:any) depends on no other project and on no
 *   framework package, so it compiles for both the browser and Node.
 */
const depConstraints = [
  // --- scope ---------------------------------------------------------------
  { sourceTag: 'scope:shell', onlyDependOnLibsWithTags: ['scope:shared'] },
  { sourceTag: 'scope:mfe', onlyDependOnLibsWithTags: ['scope:shared'] },
  { sourceTag: 'scope:api', onlyDependOnLibsWithTags: ['scope:shared'] },
  { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },

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
    onlyDependOnLibsWithTags: ['platform:any'],
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
];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc', '**/vitest.config.*.timestamp*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints,
        },
      ],
    },
  },
  // Must stay last: turns off stylistic rules that would fight with Prettier.
  prettier,
];
