import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPracticeHistory, type PracticeSession } from '@/lib/practiceHistory';

export default function ProgressScreen() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    let active = true;
    setLoading(true);
    void getPracticeHistory()
      .then((items) => { if (active) setSessions(items); })
      .catch(() => { if (active) setSessions([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useFocusEffect(refresh);

  const minutes = Math.round(sessions.reduce((sum, item) => sum + item.durationSec, 0) / 60);
  const pronunciationCount = sessions.filter((item) => item.pathway === 'pronunciation').length;
  const fluencyCount = sessions.filter((item) => item.pathway === 'fluency').length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>YOUR JOURNEY</Text>
        <Text style={styles.title}>Progress, at your own pace.</Text>
        <Text style={styles.subtitle}>Your recent practice sessions are kept on this device.</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}><Text style={styles.statNumber}>{sessions.length}</Text><Text style={styles.statLabel}>Sessions</Text></View>
          <View style={styles.statCard}><Text style={styles.statNumber}>{minutes}</Text><Text style={styles.statLabel}>Minutes</Text></View>
        </View>
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Practice pathways</Text>
          <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Pronunciation</Text><Text style={styles.breakdownValue}>{pronunciationCount}</Text></View>
          <View style={styles.breakdownRow}><Text style={styles.breakdownLabel}>Fluency & comfort</Text><Text style={styles.breakdownValue}>{fluencyCount}</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Recent sessions</Text>
        {loading ? <Text style={styles.empty}>Loading your history…</Text> : sessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Your first session starts here.</Text>
            <Text style={styles.empty}>Complete a practice activity and it will appear in this list.</Text>
          </View>
        ) : sessions.slice(0, 20).map((session) => (
          <View key={session.id} style={styles.sessionCard}>
            <View style={styles.sessionHeader}>
              <Text style={styles.sessionTitle}>{session.exerciseTitle}</Text>
              <Text style={styles.sessionDuration}>{Math.max(1, Math.round(session.durationSec))} sec</Text>
            </View>
            <Text style={styles.sessionMeta}>{session.pathway === 'pronunciation' ? 'Pronunciation & articulation' : 'Fluency & comfortable speaking'} · {new Date(session.createdAt).toLocaleDateString()}</Text>
            {session.prompt ? <Text style={styles.sessionPrompt}>“{session.prompt}”</Text> : null}
            <Text style={styles.feedback}>{session.feedback}</Text>
          </View>
        ))}
        <Text style={styles.footnote}>Practice signals are estimates for reflection, not a diagnosis or a measure of your worth as a communicator.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F8F6' },
  content: { padding: 20, paddingBottom: 36 },
  eyebrow: { color: '#0F766E', fontSize: 12, fontWeight: '800', letterSpacing: 1.3, marginTop: 8 },
  title: { color: '#123B39', fontSize: 28, lineHeight: 34, fontWeight: '800', marginTop: 8 },
  subtitle: { color: '#5B6B69', lineHeight: 21, marginTop: 8, marginBottom: 18 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, padding: 18, borderRadius: 18, backgroundColor: '#DFF4EC' },
  statNumber: { fontSize: 28, color: '#0B5B53', fontWeight: '800' },
  statLabel: { color: '#315D57', marginTop: 5, fontWeight: '600' },
  breakdownCard: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E0EBE6', padding: 18, marginTop: 12 },
  breakdownTitle: { color: '#173D3A', fontWeight: '800', fontSize: 15, marginBottom: 12 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  breakdownLabel: { color: '#5B6B69' },
  breakdownValue: { color: '#0F766E', fontWeight: '800' },
  sectionTitle: { color: '#173D3A', fontSize: 19, fontWeight: '800', marginTop: 23, marginBottom: 12 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, borderColor: '#E0EBE6', borderWidth: 1 },
  emptyTitle: { color: '#173D3A', fontWeight: '800', fontSize: 16, marginBottom: 6 },
  empty: { color: '#667673', lineHeight: 20 },
  sessionCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#E0EBE6', marginBottom: 12 },
  sessionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  sessionTitle: { color: '#173D3A', fontSize: 15, fontWeight: '800', flex: 1 },
  sessionDuration: { color: '#0F766E', fontSize: 12, fontWeight: '800' },
  sessionMeta: { color: '#71817E', fontSize: 12, marginTop: 6 },
  sessionPrompt: { color: '#355954', fontSize: 14, lineHeight: 20, marginTop: 10 },
  feedback: { color: '#5B6B69', lineHeight: 19, marginTop: 10, fontSize: 13 },
  footnote: { color: '#71817E', fontSize: 11, lineHeight: 17, marginTop: 8 },
});
