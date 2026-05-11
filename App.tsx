import { useRef, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  BackHandler,
  Alert,
  StatusBar,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';

// â ï¸  TROQUE PELA URL PUBLICADA DO SEU APP NO REPLIT
const APP_URL = 'https://SEU-APP.replit.app';

export default function App() {
  const webviewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);

  // BotÃ£o voltar do Android navega dentro do WebView
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (canGoBack && webviewRef.current) {
          webviewRef.current.goBack();
          return true;
        }
        Alert.alert(
          'Sair do app',
          'Deseja fechar o Assistente JurÃ­dico?',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Sair', onPress: () => BackHandler.exitApp() },
          ]
        );
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [canGoBack])
  );

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor="#0f4c35"
        barStyle="light-content"
        translucent={false}
      />

      <WebView
        ref={webviewRef}
        source={{ uri: APP_URL }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsBackForwardNavigationGestures={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        geolocationEnabled={false}
        cacheEnabled={true}
        pullToRefreshEnabled={true}
        // Microfone para ditado por voz
        allowsProtectedMedia={true}
        // User agent mobile para o app identificar corretamente
        userAgent="Mozilla/5.0 (Linux; Android 14) AssistenteJuridico/1.0"
        onError={(e) => {
          console.log('WebView error:', e.nativeEvent);
        }}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#16a34a" />
          </View>
        )}
        startInLoadingState={true}
      />

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f4c35',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8faf9',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(248,250,249,0.85)',
  },
});
