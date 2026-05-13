// @ts-check
import tseslint from "typescript-eslint";

const sharedRules = {
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-unused-vars": [
    "warn",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
  ],
};

export default tseslint.config(
  // Global linter options: allow broad file-level eslint-disable headers
  {
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
  // Ignore generated/build artifacts and config files
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "patches/**",
      "scripts/**",
      "drizzle/migrations/**",
      "client/src/components/ui/**",
    ],
  },
  // Source TypeScript files: full type-checked rules (these are in tsconfig.json)
  {
    files: [
      "server/**/*.ts",
      "shared/**/*.ts",
      "client/**/*.ts",
      "client/**/*.tsx",
    ],
    ignores: ["**/*.test.ts", "**/*.spec.ts"],
    extends: tseslint.configs.recommendedTypeChecked,
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...sharedRules,
      // Errors: these must not be introduced
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // Warnings: existing violations captured in lint-baseline.txt
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/require-await": "warn",
    },
  },
  // Sealed files: critical business logic — disable warning-level type-safety rules
  // (business invariants are enforced by test coverage, not lint)
  {
    files: [
      "server/services/stockInvariant.ts",
      "server/services/reservationLedger.ts",
      "server/services/aiGovernance.ts",
      "server/services/capabilityGrantService.ts",
      "server/services/auditHashChain.ts",
    ],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  // Test files: recommended without full type checking (test files excluded from tsconfig.json)
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    extends: tseslint.configs.recommended,
    rules: {
      ...sharedRules,
    },
  }
);
