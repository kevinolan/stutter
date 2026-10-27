import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const TOOLS = [
  { title: 'Guided speech practice', desc: 'Record a short sample and review your practice signals.', href: '/train', tint: '#0F766E' },
  { title: 'Breathing reset', desc: 'Take a calm pause before you begin speaking.', href: '/breathing', tint: '#3D8C83' },
  { title: 'Guided reading', desc: 'Read a sentence at a pace that feels comfortable.', href: '/reading', tint: '#567B95' },
  { title: 'Speech rhythm', desc: 'Try a gentle beat to explore comfortable pacing.', href: '/metronome', tint: '#9C7845' },
  { title: 'Delayed auditory feedback', desc: 'An optional experimental tool. Headphones are recommended.', href: '/daf', tint: '#7566A5' },
];

export default function FluencyScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>FLUENCY & COMFORTABLE SPEAKING</Text>
        <Text style={styles.title}>Make room for your own pace.</Text>
        <Text style={styles.subtitle}>There is no perfect way to speak. Choose an activity that feels useful today, and take breaks as needed.</Text>
        {TOOLS.map((tool) => (
          <Link key={tool.title} href={tool.href as '/train'} asChild>
            <TouchableOpacity style={styles.card} accessibilityRole="button">
              <View style={[styles.accent, { backgroundColor: tool.tint }]} />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{tool.title}</Text>
                <Text style={styles.cardDesc}>{tool.desc}</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          </Link>
        ))}
        <View style={styles.supportBox}>
          <Text style={styles.supportTitle}>Your pace is valid.</Text>
          <Text style={styles.supportText}>These activities support practice and self-awareness. They do not diagnose stuttering or replace care from a qualified speech-language professional.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F8F6' },
  content: { padding: 20, paddingBottom: 36 },
  eyebrow: { color: '#0F766E', fontSize: 12, letterSpacing: 1.3, fontWeight: '800', marginTop: 8 },
  title: { color: '#123B39', fontSize: 29, lineHeight: 35, fontWeight: '800', marginTop: 10 },
  subtitle: { color: '#5B6B69', fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 20 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E0EBE6', marginBottom: 12, overflow: 'hidden', minHeight: 94, paddingRight: 16 },
  accent: { width: 6, alignSelf: 'stretch', marginRight: 14 },
  cardText: { flex: 1, paddingVertical: 16 },
  cardTitle: { color: '#173D3A', fontSize: 16, fontWeight: '800', marginBottom: 5 },
  cardDesc: { color: '#5B6B69', lineHeight: 20, fontSize: 13 },
  arrow: { color: '#0F766E', fontSize: 30, marginLeft: 10 },
  supportBox: { padding: 18, borderRadius: 18, backgroundColor: '#E1F3EC', marginTop: 8 },
  supportTitle: { color: '#0B5B53', fontWeight: '800', fontSize: 16, marginBottom: 6 },
  supportText: { color: '#315D57', lineHeight: 20, fontSize: 13 },
});
