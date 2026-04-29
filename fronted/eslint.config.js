import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/set-state-in-effect": "off",
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/views/**/*.{js,jsx}", "src/components/**/*.{js,jsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "../api",
              importNames: ["callBackend"],
              message:
                "Не импортируйте callBackend напрямую в view/component. Используйте сервисный слой (src/services/orderService.js).",
            },
            {
              name: "../api.js",
              importNames: ["callBackend"],
              message:
                "Не импортируйте callBackend напрямую в view/component. Используйте сервисный слой (src/services/orderService.js).",
            },
            {
              name: "../../api",
              importNames: ["callBackend"],
              message:
                "Не импортируйте callBackend напрямую в view/component. Используйте сервисный слой (src/services/orderService.js).",
            },
            {
              name: "../../api.js",
              importNames: ["callBackend"],
              message:
                "Не импортируйте callBackend напрямую в view/component. Используйте сервисный слой (src/services/orderService.js).",
            },
          ],
        },
      ],
    },
  },
];
