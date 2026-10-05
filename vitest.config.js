import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",

    /**
     * Important for kiwi-events integration tests:
     * Multiple test files use the same local MongoDB test database.
     * Running files in parallel can cause one test file to clear the database
     * while another test file is still using it.
     */
    fileParallelism: false,

    sequence: {
      shuffle: false,
    },

    clearMocks: true,
    restoreMocks: true,
  },
});
