import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: [
      ".wrangler"
        // "!**/.eleventy.js",
        // "**/_site/",
        // "scripts/eleventy-plugin-plantuml/",
        // "static/vendors/",
    ]
}, ...compat.extends("eslint:recommended"), {
    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.commonjs,
            ...globals.node
        },

        ecmaVersion: "latest",
        sourceType: "module"
    },
    rules: {
        "linebreak-style": "off",
        "comma-dangle": ["error", "never"]
    }
}];