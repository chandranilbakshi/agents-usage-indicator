import js from '@eslint/js';

const gjsGlobals = {
    // GJS built-ins
    globalThis: 'readonly',
    imports: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    ARGV: 'readonly',
    // Web-compatible runtime globals GJS provides
    TextDecoder: 'readonly',
    TextEncoder: 'readonly',
    console: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
};

export default [
    {
        ignores: [
            'node_modules/**',
            'schemas/gschemas.compiled',
            '*.zip',
        ],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: gjsGlobals,
        },
        rules: {
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
            'no-var': 'error',
            'prefer-const': 'error',
            'eqeqeq': ['error', 'always', {null: 'ignore'}],
            'no-undef': 'error',
            'no-shadow': 'warn',
            'consistent-return': 'warn',
            'no-trailing-spaces': 'error',
            'semi': ['error', 'always'],
        },
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: {
                ...gjsGlobals,
                // node:test globals if used
                process: 'readonly',
            },
        },
    },
];
