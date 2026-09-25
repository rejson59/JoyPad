import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", ".cache/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Reguły poprawności hooków (świeżość zamknięć, kolejność efektów) —
  // bez nich łatwo wyciszyć realny bug przez exhaustive-deps.
  // Rejestrujemy plugin wprost (flat config), niezależnie od formatu presetu.
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Poniższe reguły dotyczą kompilatora Reacta / stylu pisania efektów —
      // projekt nie używa React Compiler, a synchronizacja stanu z zewnętrznych
      // systemów (singletony padHost/gameAudio) w efektach jest tu zamierzona.
      // Trzymamy reguły poprawności: rules-of-hooks i exhaustive-deps.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  {
    rules: {
      // TypeScript sam weryfikuje istnienie symboli (także globals DOM/Node) —
      // no-undef tylko generuje fałszywe alarmy w kodzie TS.
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Sprzętowy silnik STAR CLASH (z orbitalna-fala.zip) jest wstawiony niemal bez zmian
    // i używa @ts-nocheck + luźnego stylu JS. Nie przerabiamy vendoru — tylko go adaptujemy.
    files: ["src/arcade/starclash/Game.ts", "src/arcade/starclash/audio.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "prefer-const": "off",
      "no-case-declarations": "off",
      "no-empty": "off",
    },
  },
);
