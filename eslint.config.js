import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Banco principal do app é o Supabase EXTERNO (userClient).
      // Importar o client da Lovable Cloud (`@/integrations/supabase/client`)
      // graveria dados no banco ocioso. Use sempre o userClient.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/integrations/supabase/client",
              message:
                "Use @/integrations/supabase/userClient. O banco principal do app é o Supabase externo; o client da Lovable Cloud está ocioso.",
            },
          ],
        },
      ],
    },
  },
);
