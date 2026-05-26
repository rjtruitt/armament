/**
 * Global test setup — prevents all tests from writing to real ~/.armament/config.json.
 * Tests that need UserConfig persistence should mock fs or use setNoPersist.
 *
 * Note: ESM import bindings for 'fs' are captured at module load time (during setup).
 * Test files that reset the singleton with `_instance = null` create a fresh
 * UserConfig that may use real fs functions despite vi.mock('fs', ...).
 * This wrapper ensures `_noPersist` can never be false in tests.
 */
import { UserConfig } from '../config/UserConfig.js';

const instance = UserConfig.instance();
instance.setNoPersist(true);

// Guard against singleton resets — re-apply setNoPersist on every instance()
const origInstance = UserConfig.instance.bind(UserConfig);
UserConfig.instance = () => {
  const inst = origInstance();
  inst.setNoPersist(true);
  return inst;
};
