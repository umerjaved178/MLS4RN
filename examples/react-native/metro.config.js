// Metro config for consuming the linked `mls4rn-react-native` package, which
// lives outside this app and ships TypeScript/TSX source. We watch the repo
// root and let Metro resolve modules from both node_modules trees.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(repoRoot, "node_modules"),
];

// Force a single copy of React (and friends) so the linked package's provider
// shares the app's React — otherwise hooks fail with "Invalid hook call".
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
  "react-native-webview": path.resolve(projectRoot, "node_modules/react-native-webview"),
};

module.exports = config;
