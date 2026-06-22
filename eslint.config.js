import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: ['**/node_modules/**', '**/.git/**', '**/*.min.js', 'js/__tests__/**']
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        performance: 'readonly',
        URL: 'readonly',
        Headers: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Image: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        CustomEvent: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        Uint8Array: 'readonly',
        ClipboardItem: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        structuredClone: 'readonly',
        JSON: 'readonly',
        Math: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        Array: 'readonly',
        Object: 'readonly',
        String: 'readonly',
        Number: 'readonly',
        Boolean: 'readonly',
        Date: 'readonly',
        RegExp: 'readonly',
        Promise: 'readonly',
        Error: 'readonly',
        DOMException: 'readonly',
        parseInt: 'readonly',
        parseFloat: 'readonly',
        isNaN: 'readonly',
        isFinite: 'readonly',
        process: 'readonly'
      }
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prefer-const': 'warn',
      'no-var': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../api/*', '../api/**', '../../server/*', '../../server/**'],
              message:
                'Renderer modules must consume prepared scene context or injected loaders instead of provider/server modules.'
            }
          ]
        }
      ]
    }
  }
];
