import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPracticeHistory } from '@/lib/practiceHistory';

export default function HomeScreen() {
  const [sessionCount, setSessionCount] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    void getPracticeHistory().then((sessions) => { if (active) setSessionCount(sessions.length); }).catch(() => {});
    return () => { active = false; };
  }, []));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.brand}>SpeechPal <Text style={styles.brandAI}>AI</Text></Text>
            <Text style={styles.greeting}>A little practice, at your pace.</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>SP</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>YOUR SPEAKING SPACE</Text>
          <Text style={styles.heroTitle}>Build confidence one conversation at a time.</Text>
          <Text style={styles.heroBody}>Practice in a way that feels right for you. There is no perfect pace and no score you need to chase.</Text>
          <View style={styles.heroFooter}>
            <View><Text style={styles.heroCount}>{sessionCount}</Text><Text style={styles.heroCountLabel}>sessions completed</Text></View>
            <Text style={styles.heroMark}>✳</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Choose your practice</Text>
        <Text style={styles.sectionSub}>Two pathways, designed for different goals.</Text>
        <Link href="/pronunciation" asChild>
          <TouchableOpacity style={styles.pathCard} accessibilityRole="button">
            <View style={styles.pathIconPron}><Text style={styles.pathIconText}>Aa</Text></View>
            <View style={styles.pathText}>
              <Text style={styles.pathTitle}>Pronunciation & articulation</Text>
              <Text style={styles.pathDesc}>Practice sounds, words, and short sentences with guided prompts.</Text>
              <Text style={styles.pathLink}>Explore exercises  →</Text>
            </View>
          </TouchableOpacity>
        </Link>
        <Link href="/fluency" asChild>
          <TouchableOpacity style={styles.pathCard} accessibilityRole="button">
            <View style={styles.pathIconFluency}><Text style={styles.pathIconText}>〰</Text></View>
            <View style={styles.pathText}>
              <Text style={styles.pathTitle}>Fluency & comfortable speaking</Text>
              <Text style={styles.pathDesc}>Explore breathing, guided reading, rhythm, and self-paced recording.</Text>
              <Text style={styles.pathLink}>Explore activities  →</Text>
            </View>
          </TouchableOpacity>
        </Link>

        <View style={styles.tip}>
          <Text style={styles.tipIcon}>✦</Text>
          <View style={styles.tipTextWrap}>
            <Text style={styles.tipTitle}>A gentle reminder</Text>
            <Text style={styles.tipBody}>Pausing is okay. Your voice is yours, and progress can look different for everyone.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F8F6' },
  content: { padding: 20, paddingBottom: 30 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 20 },
  brand: { fontSize: 26, fontWeight: '900', letterSpacing: -0.8, color: '#123B39' },
  brandAI: { color: '#0F766E' },
  greeting: { color: '#687975', marginTop: 4, fontSize: 14 },
  avatar: { height: 44, width: 44, borderRadius: 16, backgroundColor: '#DFF4EC', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#0F766E', fontWeight: '900' },
  hero: { backgroundColor: '#123F3B', borderRadius: 26, padding: 23, marginBottom: 25 },
  heroEyebrow: { color: '#9DE4D1', letterSpacing: 1.4, fontSize: 10, fontWeight: '900' },
  heroTitle: { color: '#FFFFFF', fontSize: 27, lineHeight: 33, fontWeight: '800', marginTop: 12, letterSpacing: -0.4 },
  heroBody: { color: '#D3E8E1', lineHeight: 21, fontSize: 14, marginTop: 10 },
  heroFooter: { borderTopWidth: 1, borderTopColor: '#37635D', marginTop: 20, paddingTop: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroCount: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  heroCountLabel: { color: '#B9D5CC', fontSize: 11, marginTop: 2 },
  heroMark: { color: '#9DE4D1', fontSize: 32 },
  sectionTitle: { color: '#173D3A', fontSize: 20, fontWeight: '900' },
  sectionSub: { color: '#71817E', fontSize: 13, marginTop: 5, marginBottom: 14 },
  pathCard: { backgroundColor: '#FFFFFF', borderRadius: 21, padding: 17, flexDirection: 'row', borderWidth: 1, borderColor: '#E0EBE6', marginBottom: 13, alignItems: 'flex-start' },
  pathIconPron: { height: 50, width: 50, borderRadius: 16, backgroundColor: '#DFF4EC', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  pathIconFluency: { height: 50, width: 50, borderRadius: 16, backgroundColor: '#E8E8F9', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  pathIconText: { color: '#0F766E', fontSize: 20, fontWeight: '900' },
  pathText: { flex: 1 },
  pathTitle: { color: '#173D3A', fontSize: 16, fontWeight: '900', lineHeight: 22 },
  pathDesc: { color: '#647571', fontSize: 13, lineHeight: 19, marginTop: 5 },
  pathLink: { color: '#0F766E', fontSize: 12, fontWeight: '900', marginTop: 12 },
  tip: { backgroundColor: '#E8F4EE', borderRadius: 18, padding: 16, flexDirection: 'row', marginTop: 7 },
  tipIcon: { color: '#0F766E', fontSize: 22, marginRight: 11 },
  tipTextWrap: { flex: 1 },
  tipTitle: { color: '#24564E', fontSize: 14, fontWeight: '900' },
  tipBody: { color: '#52736B', lineHeight: 19, fontSize: 12, marginTop: 4 },
});
