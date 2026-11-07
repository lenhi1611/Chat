import { withNativeFederation } from '@angular-architects/native-federation/config';
import {
  features,
  sharedPackages,
  skip,
} from '../../tools/federation/shared.mjs';

export default withNativeFederation({
  name: 'mfe-auth',
  exposes: {
    './routes': './apps/mfe-auth/src/app/auth.routes.ts',
  },
  shared: sharedPackages(),
  skip,
  features,
});
