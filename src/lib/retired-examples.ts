import { canonical, sha256, validateStore } from './content';
import type { Store } from './schema';
// One-time deletion explicitly requested by the owner. This fingerprints the
// entire initial example corpus, including bodies and publication metadata.
// Flags such as is_example and author names never authorize another deletion.
const INITIAL_EXAMPLE_CORPUS = '5d65d75bc511af58868162b290f027b2cb4ee76caa918cdfb5a8d2703262b2a9';
export function validateContentChange(current: Store, baseline?: Store) {
  const exactRetirement =
    baseline &&
    sha256(canonical(baseline)) === INITIAL_EXAMPLE_CORPUS &&
    Object.values(current).every((table) => Object.keys(table).length === 0);
  validateStore(current, exactRetirement ? undefined : baseline);
}
