// Punto de entrada de React Native: registra el componente raíz con AppRegistry.
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
