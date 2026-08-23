import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * The library's own tests, run from the library's own directory. They reach the
 * door by its published name so a test exercises the same entry a consumer gets,
 * which needs an alias here because nothing has installed the package into
 * itself. The two backends are reached by relative path instead, which is what
 * lets a white-box test hold a backend the door withholds on purpose.
 *
 * The environment is node. Nothing here touches a document: a canvas and a device
 * both arrive as stand-ins the tests build, so a DOM would be a dependency the
 * library carries to prove things that never look at one.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@altpsyche/engine': path.resolve(import.meta.dirname, './index.ts'),
    },
  },
});
