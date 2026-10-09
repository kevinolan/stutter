import React from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.title}>SpeechPal</ThemedText>
          <ThemedText style={styles.subtitle}>Your companion for fluent speech</ThemedText>
        </ThemedView>

        <View style={styles.grid}>
          <FeatureCard 
            title="Speech Training" 
            description="Record and analyze your voice patterns" 
            icon="waveform" 
            color="#4F46E5"
            href="/train"
          />
          <FeatureCard 
            title="DAF Engine" 
            description="Delayed Auditory Feedback practice" 
            icon="headphones" 
            color="#3B82F6"
            href="/daf"
          />
          <FeatureCard 
            title="Box Breathing" 
            description="Reduce tension before speaking" 
            icon="wind" 
            color="#06B6D4"
            href="/breathing"
          />
          <FeatureCard 
            title="Metronome" 
            description="Pace your speech with a steady beat" 
            icon="timer" 
            color="#F59E0B"
            href="/metronome"
          />
          <FeatureCard 
            title="Reading Practice" 
            description="Guided rhythmic reading exercises" 
            icon="book.fill" 
            color="#8B5CF6"
            href="/reading"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureCard({ title, description, icon, color, href }: any) {
  return (
    <Link href={href} asChild>
      <TouchableOpacity style={styles.card}>
        <View style={[styles.iconContainer, { backgroundColor: color }]}>
          <IconSymbol name={icon} size={24} color="#FFF" />
        </View>
        <View style={styles.cardText}>
          <ThemedText type="defaultSemiBold" style={styles.cardTitle}>{title}</ThemedText>
          <ThemedText style={styles.cardDescription}>{description}</ThemedText>
        </View>
        <IconSymbol name="chevron.right" size={16} color="#94A3B8" />
      </TouchableOpacity>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 24,
  },
  header: {
    marginBottom: 32,
    marginTop: 10,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1E293B',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 4,
  },
  grid: {
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    color: '#1E293B',
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
});
