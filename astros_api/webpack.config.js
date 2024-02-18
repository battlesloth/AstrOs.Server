const path = require('path');

module.exports = {
    entry: './src/api_server.ts',
    devtool: 'inline-source-map',
    target: 'node',
    stats: {
      errorDetails: true
    },
    module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: [{
                loader:'ts-loader',
                options: {
                    configFile: "tsconfig.prod.json"
                }
            }],
            exclude: /node_modules/,
          },
        ],
      },
      resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        mainFields: ['main', 'browser']
      },
      output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
        devtoolModuleFilenameTemplate: '[absolute-resource-path]'
      },
      mode: 'production',
      externals: {
        sqlite3: 'commonjs sqlite3',
        serialport: 'serialport',
        bufferutil: "bufferutil",
        "utf-8-validate": "utf-8-validate"
    },
    devtool: 'source-map'
      
};