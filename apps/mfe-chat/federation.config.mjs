import { withNativeFederation } from '@angular-architects/native-federation/config';
import {
  features,
  sharedPackages,
  skip,
} from '../../tools/federation/shared.mjs';

export default withNativeFederation({
  name: 'mfe-chat',
  exposes: {
    './routes': './apps/mfe-chat/src/app/chat.routes.ts',
  },
  shared: sharedPackages(),
  skip,
  features,
});
