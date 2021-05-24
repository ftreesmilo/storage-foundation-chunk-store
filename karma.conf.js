const { ProvidePlugin } = require('webpack');

// eslint-disable-next-line import/no-extraneous-dependencies
process.env.CHROME_BIN = require('puppeteer').executablePath();

module.exports = (config) => {
  config.set({
    frameworks: ['webpack', 'source-map-support', 'mocha', 'chai'],
    files: [
      './node_modules/regenerator-runtime/runtime.js',
      { pattern: 'test/**/*.js', type: 'module' },
    ],
    preprocessors: {
      'test/**/*.js': ['webpack', 'sourcemap'],
    },
    reporters: ['progress'],
    colors: true,
    logLevel: config.LOG_INFO,
    browsers: ['ChromeHeadlessWithStorage'],
    autoWatch: false,
    singleRun: true,
    port: 80,
    concurrency: 1,
    customHeaders: [
      {
        match: '.*',
        name: 'Cross-Origin-Embedder-Policy',
        value: 'require-corp',
      },
      {
        match: '.*',
        name: 'Cross-Origin-Opener-Policy',
        value: 'same-origin',
      },
    ],
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
