import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import perfectionist from "eslint-plugin-perfectionist";
import tsparser from "@typescript-eslint/parser";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    plugins: {
      perfectionist,
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      // Disable specific @typescript-eslint rules
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-function": "off",
      "no-prototype-builtins": "off",

      // Enable TypeScript member ordering
      "@typescript-eslint/member-ordering": "error",

      // Sentence case rule with brand names
      "obsidianmd/ui/sentence-case": ["error", { brands: ["Note Navigator", "Obsidian"] }],

      // Perfectionist sorting rules
      "perfectionist/sort-imports": "error",
      "perfectionist/sort-objects": ["error", { type: "alphabetical" }],
    },
  },
]);
