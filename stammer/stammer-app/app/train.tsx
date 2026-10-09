import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert, Text, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import Slider from '@react-native-community/slider';
import * as FileSystem from 'expo-file-system';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getIdentity } from '@/lib/identity';
import { analyzeRecording, buildIngestPayload } from '@/lib/analyzeRecording';
import { enqueueMetrics, flushQueue } from '@/lib/syncQueue';

export default function TrainScreen() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<{
    pStutter: number | null;
    usedModel: boolean;
    repetitions: number;
    prolongations: number;
    blocks: number;
    wordCount: number;
    ratePerMin: number;
    disfluencies: number;
    durationSec: number;
    easeRating: number;
    fluencySummary: string | null;
  } | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'offline'>('idle');
  const [easeRating, setEaseRating] = useState(50);

  const scale = useSharedValue(1);

  // Flush pending metrics on mount + app focus
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushQueue();
    });
    void flushQueue();
    return () => subscription.remove();
  }, []);

  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant microphone access to record.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
      setResults(null);
      setSyncStatus('idle');

      scale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        true
      );
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Could not start recording.');
    }
  }

  async function stopRecording() {
    setIsRecording(false);
    setRecording(null);
    scale.value = withTiming(1);

    if (!recording) return;
    const uri = recording.getURI();
    if (!uri) return;

    setIsProcessing(true);
    try {
      const status = await recording.getStatusAsync();
      const durationSec = Math.round(status.durationMillis / 1000);
      await recording.stopAndUnloadAsync();

      const identity = await getIdentity();
      const analysis = await analyzeRecording({
        recordingUri: uri,
        durationSec,
        easeRating,
        // Phase 2+: auto-transcribe via on-device STT here.
      });

      setResults({
        pStutter: analysis.metric.pStutter,
        usedModel: analysis.usedModel,
        repetitions: analysis.metric.heuristic.repetitions,
        prolongations: analysis.metric.heuristic.prolongations,
        blocks: analysis.metric.heuristic.blocks,
        wordCount: analysis.metric.heuristic.wordCount,
        ratePerMin: analysis.metric.heuristic.ratePerMin,
        disfluencies: analysis.metric.heuristic.disfluencies,
        durationSec: analysis.metric.durationSec,
        easeRating,
        fluencySummary: analysis.fluencySummary,
      });

      // Build + enqueue the payload. If backend is reachable it posts
      // immediately via flush; if not, it's queued for later.
      const payload = buildIngestPayload(analysis, identity);
      try {
        await enqueueMetrics(payload);
        setSyncStatus('syncing');
        const result = await flushQueue();
        if (result.posted > 0) {
          setSyncStatus('synced');
        } else if (result.errors.includes('backend_unreachable')) {
          setSyncStatus('offline');
        }
      } catch (e) {
        setSyncStatus('offline');
      }

      // Clean up the temp file
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {}
    } catch (err) {
      console.error('Analysis failed', err);
      Alert.alert('Error', 'Could not process the recording.');
    } finally {
      setIsProcessing(false);
    }
  }

  function reset() {
    setResults(null);
    setSyncStatus('idle');
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function renderMetric(label: string, value: number | string, accent = '#4F46E5') {
    return (
      <View style={styles.metric}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={[styles.metricValue, { color: accent }]}>{value}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Speech Training</ThemedText>
        <ThemedText style={styles.subtitle}>Record your speech to analyze patterns</ThemedText>
      </View>

      <View style={styles.content}>
        {!results && !isProcessing && (
          <View style={styles.recordContainer}>
            <Animated.View
              style={[
                styles.pulseCircle,
                animatedStyle,
                isRecording && styles.recordingActive,
              ]}
            />
            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.buttonActive]}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <IconSymbol
                name={isRecording ? 'square.fill' : 'waveform'}
                size={40}
                color="#FFF"
              />
            </TouchableOpacity>
            <ThemedText style={styles.instruction}>
              {isRecording ? 'Stop to see analysis' : 'Tap to start recording'}
            </ThemedText>
          </View>
        )}

        {isProcessing && (
          <View style={styles.processingContainer}>
            <IconSymbol name="timer" size={60} color="#4F46E5" />
            <ThemedText type="subtitle" style={styles.processingText}>
              Analyzing your speech…
            </ThemedText>
          </View>
        )}

        {results && (
          <View style={styles.resultsContainer}>
            <ThemedText type="subtitle" style={styles.resultsTitle}>
              Analysis Complete
            </ThemedText>

            {/* Sync status indicator */}
            <View style={styles.syncRow}>
              <IconSymbol
                name={
                  syncStatus === 'synced'
                    ? 'checkmark.circle.fill'
                    : syncStatus === 'offline'
                    ? 'exclamationmark.triangle.fill'
                    : syncStatus === 'syncing'
                    ? 'arrow.clockwise'
                    : 'circle'
                }
                size={20}
                color={
                  syncStatus === 'synced'
                    ? '#10B981'
                    : syncStatus === 'offline'
                    ? '#F59E0B'
                    : '#94A3B8'
                }
              />
              <ThemedText style={styles.syncText}>
                {syncStatus === 'synced'
                  ? 'Synced to your clinician dashboard'
                  : syncStatus === 'offline'
                  ? 'Will sync when online'
                  : syncStatus === 'syncing'
                  ? 'Syncing…'
                  : 'Recorded'}
              </ThemedText>
            </View>

            {/* ONNX model status badge */}
            <View style={styles.modelBadge}>
              <ThemedText style={styles.modelBadgeText}>
                {results.usedModel ? 'ONNX model active' : 'Heuristic mode (model unavailable)'}
              </ThemedText>
            </View>

            {/* Core stats grid */}
            <View style={styles.metricRow}>
              {renderMetric(
                'P(stutter)',
                results.pStutter === null
                  ? '—'
                  : `${Math.round(results.pStutter * 100)}%`,
                results.pStutter === null ? '#94A3B8' : '#EF4444',
              )}
              {renderMetric('Repetitions', results.repetitions)}
              {renderMetric('Prolongations', results.prolongations)}
              {renderMetric('Blocks', results.blocks)}
            </View>

            <View style={styles.easeCard}>
              <View style={styles.easeHeader}>
                <ThemedText style={styles.easeLabel}>Communication ease</ThemedText>
                <ThemedText style={styles.easeValue}>{easeRating}/100</ThemedText>
              </View>
              <Slider
                style={styles.easeSlider}
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={easeRating}
                onValueChange={setEaseRating}
                minimumTrackTintColor="#10B981"
                maximumTrackTintColor="#CBD5E1"
                thumbTintColor="#10B981"
              />
              <ThemedText style={styles.easeHint}>Your own sense of confidence while speaking</ThemedText>
            </View>

            <View style={styles.metricRow}>
              {renderMetric('Words', results.wordCount)}
              {renderMetric('Rate/min', results.ratePerMin)}
              {renderMetric('Disfluencies', results.disfluencies)}
            </View>

            {/* Encouraging, non-judgmental summary (ASHA-aligned) */}
            {results.fluencySummary ? (
              <View style={styles.summaryCard}>
                <ThemedText style={styles.summaryText}>{results.fluencySummary}</ThemedText>
              </View>
            ) : (
              <View style={styles.summaryCard}>
                <ThemedText style={styles.summaryText}>
                  Recording saved. The on-device model analyzed your speech patterns.
                  Share this with your clinician for context.
                </ThemedText>
              </View>
            )}

            <TouchableOpacity style={styles.retryButton} onPress={reset}>
              <ThemedText style={styles.retryText}>Record Again</ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    padding: 24,
    alignItems: 'center',
  },
  subtitle: {
    color: '#64748B',
    marginTop: 8,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  recordContainer: {
    alignItems: 'center',
  },
  pulseCircle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4F46E5',
    opacity: 0.2,
  },
  recordingActive: {
    backgroundColor: '#EF4444',
    opacity: 0.3,
  },
  recordButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  buttonActive: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  instruction: {
    marginTop: 32,
    color: '#64748B',
    fontWeight: '500',
  },
  processingContainer: {
    alignItems: 'center',
  },
  processingText: {
    marginTop: 16,
    color: '#4F46E5',
  },
  resultsContainer: {
    width: '100%',
    backgroundColor: '#FFF',
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  resultsTitle: {
    marginBottom: 16,
    color: '#1E293B',
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  syncText: {
    fontSize: 13,
    color: '#64748B',
  },
  modelBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 16,
  },
  modelBadgeText: {
    fontSize: 12,
    color: '#475569',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 12,
  },
  metric: {
    alignItems: 'center',
  },
  metricLabel: {
    color: '#64748B',
    marginBottom: 4,
    fontSize: 13,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: '#F0FDF4',
    padding: 16,
    borderRadius: 16,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  easeCard: {
    width: '100%',
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
  },
  easeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  easeLabel: {
    color: '#065F46',
    fontWeight: '600',
  },
  easeValue: {
    color: '#047857',
    fontWeight: '700',
  },
  easeSlider: {
    width: '100%',
    height: 36,
  },
  easeHint: {
    color: '#047857',
    fontSize: 12,
  },
  summaryText: {
    color: '#14532D',
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 16,
  },
  retryText: {
    color: '#4F46E5',
    fontWeight: '600',
  },
});
