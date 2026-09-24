// Config de pruebas e2e (Detox) para emuladores iOS 15+ / Android 8.0+ (API 26+).
//
// Task 24 — Requirements: 21.1, 21.2
// Nota: SOLO configuración. Ejecutar Detox requiere el toolchain nativo
// (Xcode + simuladores iOS, Android SDK + emuladores, CocoaPods, applesimutils)
// que no está disponible en este entorno. No se ejecuta aquí.
/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath:
        'ios/build/Build/Products/Debug-iphonesimulator/DigitalFootballAlbum.app',
      build:
        "xcodebuild -workspace ios/DigitalFootballAlbum.xcworkspace -scheme DigitalFootballAlbum -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build",
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build:
        'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        // iOS 15+ (Req 21.1)
        type: 'iPhone 14',
      },
    },
    emulator: {
      type: 'android.emulator',
      device: {
        // Android 8.0 API 26+ (Req 21.2)
        avdName: 'Pixel_API_26',
      },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};
