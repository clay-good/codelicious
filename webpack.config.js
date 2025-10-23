const path = require('path');

module.exports = {
  target: 'node',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode',
    // ChromaDB optional dependencies
    'chromadb-default-embed': 'commonjs chromadb-default-embed',
    '@xenova/transformers': 'commonjs @xenova/transformers',
    'ollama': 'commonjs ollama',
    'cohere-ai': 'commonjs cohere-ai'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      // Ignore optional dependencies
      'chromadb-default-embed': false,
      '@xenova/transformers': false,
      'ollama': false,
      'cohere-ai': false
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  ignoreWarnings: [
    {
      module: /chromadb/,
    },
    {
      module: /typescript/,
      message: /Critical dependency: the request of a dependency is an expression/,
    },
  ],
  plugins: [
    new (require('webpack').IgnorePlugin)({
      resourceRegExp: /^https:\/\//,
    }),
  ]
};

