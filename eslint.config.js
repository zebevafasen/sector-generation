module.exports = [
    {
        ignores: ['node_modules/**', 'test-results/**']
    },
    {
        files: ['js/**/*.js', 'names/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module'
        },
        rules: {
            'no-unused-vars': ['error', { args: 'none' }]
        }
    },
    {
        files: ['tests/**/*.js', 'playwright.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs'
        },
        rules: {
            'no-unused-vars': ['error', { args: 'none' }]
        }
    }
];
