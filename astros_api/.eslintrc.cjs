module.exports ={
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: [
      '@typescript-eslint',
      'require-extensions'
    ],
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:require-extensions/recommended'
    ],
    //"defaultSeverity": "error",
    //"extends": [
    //    "tslint:recommended"
    //],
    //"jsRules": {},
    rules: {
        "no-console": 0,
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "next|^_" }],
    },
    env: {
      "jest": true
    }
    //"rulesDirectory": []
};