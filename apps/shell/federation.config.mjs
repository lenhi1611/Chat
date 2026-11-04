import { withNativeFederation } from '@angular-architects/native-federation/config';
import {
  features,
  sharedPackages,
  skip,
} from '../../tools/federation/shared.mjs';

// Dynamic host: remotes are discovered at runtime from public/federation.manifest.json.
export default withNativeFederation({
  name: 'shell',
  shared: sharedPackages(),
  skip,
  features,
});
