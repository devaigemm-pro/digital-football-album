// Config de Babel del cliente React Native.
//
// Task 24 — Requirements: 21.1, 21.2
//
// `react-native-reanimated/plugin` DEBE ir el ÚLTIMO en la lista de plugins
// (requisito de Reanimated: transforma las worklets tras el resto de plugins).
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['react-native-reanimated/plugin'],
};
