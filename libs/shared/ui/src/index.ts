// Public API of @realtime-chat/ui. Apps import only from '@realtime-chat/ui'.
//
// Component sources are copied in by zard-cli (see components.json) and are
// owned by this repo: edit them freely. Add new ones with
//   npx zard-cli@latest add <component>
// then export them below.

// Setup
export { provideZard } from './lib/shared/core/provider/providezard';
export { mergeClasses } from './lib/shared/utils/merge-classes';

// Components
export * from './lib/shared/components/avatar';
export * from './lib/shared/components/badge';
export * from './lib/shared/components/button';
export * from './lib/shared/components/alert';
export * from './lib/shared/components/card';
export * from './lib/shared/components/field';
export * from './lib/shared/components/input';
export * from './lib/shared/components/input-group';
