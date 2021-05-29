const { ProvidePlugin } = require('webpack');

module.exports = (config) => {
  config.set({
    frameworks: ['webpack', 'source-map-support', 'mocha', 'chai'],
    files: [
      './node_modules/regenerator-runtime/runtime.js',
      { pattern: 'test/**/*tests.js', type: 'module' },
    ],
    preprocessors: {
      'test/**/*tests.js': ['webpack', 'sourcemap'],
    },
    reporters: ['mocha'],
    colors: true,
    logLevel: config.LOG_INFO,
    browsers: ['ChromeHeadlessWithStorage'],
    autoWatch: false,
    singleRun: true,
    port: 80,
    concurrency: 1,
    customLaunchers: {
      ChromeHeadlessWithStorage: {
        base: 'ChromeHeadless',
        flags: [
          '--enable-blink-features=StorageFoundationAPI',
        ],
      },
    },
    webpack: {
      devtool: 'inline-source-map',
      plugins: [
        new ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
        }),
      ],
      module: {
        rules: [
          {
            test: /\.js$/,
            exclude: /(node_modules|bower_components)/,
            use: {
              loader: 'babel-loader',
              options: {
                presets: ['@babel/preset-env'],
              },
            },
          },
        ],
      },
    },
  });
};
