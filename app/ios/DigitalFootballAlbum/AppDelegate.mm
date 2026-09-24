#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

// Firebase (@react-native-firebase/app): la configuración de Firebase requiere
// el pod de Firebase — presente vía @react-native-firebase — y el archivo
// `GoogleService-Info.plist` añadido al target en Xcode. Mientras ese pod no
// esté instalado (`pod install`) el import de <Firebase.h> no resuelve, por lo
// que se guarda con `__has_include` para que el proyecto compile igualmente
// antes de añadir Firebase. Al instalar el pod y el plist, `[FIRApp configure]`
// se ejecuta y habilita push (APNs) / Cloud Messaging.
#if __has_include(<Firebase.h>)
#import <Firebase.h>
#endif

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
#if __has_include(<Firebase.h>)
  // Configura el SDK de Firebase si el pod está presente y hay
  // GoogleService-Info.plist en el bundle. Debe ir ANTES de crear el bridge.
  if ([FIRApp defaultApp] == nil) {
    [FIRApp configure];
  }
#endif

  self.moduleName = @"DigitalFootballAlbum";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
