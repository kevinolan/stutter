/**
 * Metro config for SpeechPal.
 *
 * Rescues the `file:../../shared` workspace dependency so Metro can resolve
 * `@fluentpath/shared` (which contains `zod`, a pure-JS ESM/CJS package)
 * on both native and web bundlers.
 */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow importing from the shared package's TS source directly.
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs', 'mjs'];
config.resolver.assetExts = [...config.resolver.assetExts, 'onnx'];
config.resolver.extraNodeModules = {
  '@fluentpath/shared': require.resolve('@fluentpath/shared'),
};

module.exports = config;
