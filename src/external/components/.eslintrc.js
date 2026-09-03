module.exports = {
    extends: '../../../.eslintrc.js',
    overrides: [
        {
            files: ['*.ts', '*.tsx'],
            rules: {
                'react/prop-types': 'off',
            },
        },
        {
            files: ['./src/components/icon/icons-manifest.js'],
            rules: {
                quotes: 'off',
            },
        },
    ],
    settings: {
        react: {
            version: '16',
        },
    },
    rules: {
        'simple-import-sort/imports': 'warn',
    },
};
