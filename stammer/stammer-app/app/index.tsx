import { Link } from 'expo-router';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Home() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Guided Practice Hub</Text>
          </View>
          <Text style={styles.title}>Speak With More Confidence</Text>
          <Text style={styles.subtitle}>
            SpeechPal brings breathing, rhythm, reading, delayed feedback, and training analysis into one focused space.
          </Text>

          <Link href="/train" asChild>
            <TouchableOpacity style={styles.ctaButton}>
              <Text style={styles.ctaText}>Start Training</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <Text style={styles.sectionTitle}>Training Modules</Text>
        <View style={styles.grid}>
          <Link href="/breathing" asChild>
            <TouchableOpacity style={[styles.card, { borderLeftColor: '#06B6D4' }]}>
              <Text style={styles.cardTitle}>Breathing</Text>
              <Text style={styles.cardDesc}>Guided exercises for relaxation</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/metronome" asChild>
            <TouchableOpacity style={[styles.card, { borderLeftColor: '#F97316' }]}>
              <Text style={styles.cardTitle}>Metronome</Text>
              <Text style={styles.cardDesc}>Pace your speech rhythm</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/reading" asChild>
            <TouchableOpacity style={[styles.card, { borderLeftColor: '#14B8A6' }]}>
              <Text style={styles.cardTitle}>Reading</Text>
              <Text style={styles.cardDesc}>Practice guided pacing</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/daf" asChild>
            <TouchableOpacity style={[styles.card, { borderLeftColor: '#0EA5A4' }]}>
              <Text style={styles.cardTitle}>DAF Loop</Text>
              <Text style={styles.cardDesc}>Delayed Auditory Feedback</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/train" asChild>
            <TouchableOpacity style={[styles.card, { borderLeftColor: '#EA580C' }]}>
              <Text style={styles.cardTitle}>Speech Training</Text>
              <Text style={styles.cardDesc}>Record and get instant fluency insights</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>How This Helps</Text>
          <Text style={styles.infoText}>1. Improve breath control before speaking.</Text>
          <Text style={styles.infoText}>2. Build rhythm and pacing consistency.</Text>
          <Text style={styles.infoText}>3. Track progress session by session.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F8F5',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  heroCard: {
    marginTop: 24,
    marginBottom: 28,
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 4,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#164E63',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 14,
  },
  badgeText: {
    color: '#D6F5FF',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#CBD5E1',
    fontWeight: '500',
    lineHeight: 23,
    marginBottom: 20,
  },
  ctaButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#F97316',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 20,
    color: '#0F172A',
    fontWeight: '800',
    marginBottom: 14,
  },
  grid: {
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    borderLeftWidth: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  infoSection: {
    marginTop: 18,
    backgroundColor: '#ECFEFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#A5F3FC',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0C4A6E',
    marginBottom: 8,
  },
  infoText: {
    color: '#155E75',
    fontSize: 15,
    marginBottom: 6,
    lineHeight: 22,
  },
});
