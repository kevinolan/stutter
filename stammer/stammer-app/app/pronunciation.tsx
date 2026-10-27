import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const EXERCISES = [
  { id: 'clear-s', title: 'Clear “s” sounds', level: 'Starter', prompt: 'Six small steps start the story.', detail: 'Practice a clear /s/ sound in a short sentence.' },
  { id: 'th-sound', title: '“th” sound practice', level: 'Starter', prompt: 'Think through the three things.', detail: 'Take your time with the target sound.' },
  { id: 'r-sound', title: '“r” sound practice', level: 'Building', prompt: 'Rita reads a really good story.', detail: 'Focus on the words that feel challenging.' },
  { id: 'v-sound', title: '“v” sound practice', level: 'Building', prompt: 'Victor visited the village on Friday.', detail: 'Practice the sound in words and connected speech.' },
  { id: 'daily-sentence', title: 'Everyday sentence', level: 'All levels', prompt: 'I would like to ask a question, please.', detail: 'Practice a useful sentence at your own pace.' },
];

export default function PronunciationScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>PRONUNCIATION PATHWAY</Text>
        <Text style={styles.title}>Practice sounds, one step at a time.</Text>
        <Text style={styles.subtitle}>Choose a short prompt. You can pause, retry, or stop whenever you need to.</Text>

        {EXERCISES.map((exercise) => (
          <View key={exercise.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{exercise.title}</Text>
              <Text style={styles.level}>{exercise.level}</Text>
            </View>
            <Text style={styles.detail}>{exercise.detail}</Text>
            <Text style={styles.promptLabel}>YOUR PROMPT</Text>
            <Text style={styles.prompt}>{exercise.prompt}</Text>
            <Link href={{ pathname: '/train', params: { pathway: 'pronunciation', exerciseTitle: exercise.title, prompt: exercise.prompt } }} asChild>
              <TouchableOpacity style={styles.button} accessibilityRole="button">
                <Text style={styles.buttonText}>Start practice</Text>
              </TouchableOpacity>
            </Link>
          </View>
        ))}

        <Text style={styles.note}>Feedback is for practice and self-reflection. It is not a clinical assessment, and speech recognition can make mistakes.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F8F6' },
  content: { padding: 20, paddingBottom: 36 },
  eyebrow: { color: '#0F766E', fontSize: 12, letterSpacing: 1.4, fontWeight: '800', marginTop: 8 },
  title: { color: '#123B39', fontSize: 29, lineHeight: 35, fontWeight: '800', marginTop: 10 },
  subtitle: { color: '#5B6B69', fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 18 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E0EBE6' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { flex: 1, color: '#173D3A', fontSize: 17, fontWeight: '800' },
  level: { color: '#0F766E', backgroundColor: '#DDF5EE', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 9, fontSize: 11, fontWeight: '700' },
  detail: { color: '#5B6B69', marginTop: 8, lineHeight: 20 },
  promptLabel: { color: '#71817E', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginTop: 15 },
  prompt: { color: '#163B38', fontSize: 18, lineHeight: 26, fontWeight: '600', marginTop: 5 },
  button: { backgroundColor: '#0F766E', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 15, alignItems: 'center', marginTop: 15 },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  note: { color: '#667673', fontSize: 12, lineHeight: 18, marginTop: 6, paddingHorizontal: 3 },
});
