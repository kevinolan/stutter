import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearPracticeHistory } from '@/lib/practiceHistory';

export default function SettingsScreen() {
  const clearHistory = () => {
    Alert.alert(
      'Clear practice history?',
      'This removes saved session summaries from this device. It does not delete anything already synced to a configured backend.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear history',
          style: 'destructive',
          onPress: () => {
            void clearPracticeHistory().then(() => {
              Alert.alert('History cleared', 'Your local practice history has been removed.');
            }).catch(() => {
              Alert.alert('Could not clear history', 'Please try again.');
            });
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>PREFERENCES</Text>
        <Text style={styles.title}>Settings & privacy.</Text>
        <Text style={styles.subtitle}>Simple controls for your SpeechPal experience.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Audio privacy</Text>
          <Text style={styles.cardText}>SpeechPal keeps the temporary recording available for replay only while the practice screen is open, then removes it when you leave or reset that screen. Raw audio is not intentionally stored in your session history. Cloud speech transcription is not yet enabled.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Practice history</Text>
          <Text style={styles.cardText}>Session summaries are stored locally on this device. Clearing this history does not erase records already synced to a backend.</Text>
          <TouchableOpacity accessibilityRole="button" onPress={clearHistory} style={styles.dangerButton}>
            <Text style={styles.dangerButtonText}>Clear local practice history</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About feedback</Text>
          <Text style={styles.cardText}>SpeechPal provides practice support and self-reflection, not medical diagnosis. Audio transcription and automated speech metrics can be inaccurate. A qualified speech-language professional can provide individualized assessment and guidance.</Text>
        </View>
        <Text style={styles.version}>SpeechPal AI · Android-first MVP</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F8F6' },
  content: { padding: 20, paddingBottom: 36 },
  eyebrow: { color: '#0F766E', fontSize: 12, fontWeight: '800', letterSpacing: 1.3, marginTop: 8 },
  title: { color: '#123B39', fontSize: 28, fontWeight: '800', marginTop: 8 },
  subtitle: { color: '#5B6B69', lineHeight: 21, marginTop: 8, marginBottom: 18 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E0EBE6', padding: 18, marginBottom: 13 },
  cardTitle: { color: '#173D3A', fontWeight: '800', fontSize: 16, marginBottom: 8 },
  cardText: { color: '#5B6B69', lineHeight: 21, fontSize: 13 },
  dangerButton: { backgroundColor: '#FCE9E6', borderRadius: 12, alignItems: 'center', padding: 13, marginTop: 14 },
  dangerButtonText: { color: '#9F2D23', fontWeight: '800' },
  version: { color: '#71817E', fontSize: 12, textAlign: 'center', marginTop: 14 },
});
