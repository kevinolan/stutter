import React, { useState, useEffect, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View, TouchableOpacity, Alert, Text, AppState, Switch } from 'react-native';
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
import { savePracticeSession, type PracticePathway } from '@/lib/practiceHistory';
import { transcribeRecording } from '@/lib/transcription';
import { comparePrompt, type PromptComparison } from '@/lib/promptComparison';

/**
 * iOS records 16 kHz mono 16-bit WAV so the on-device ONNX model can read raw
 * PCM directly. Android's MediaRecorder has no WAV encoder, so it keeps the
 * AAC preset and those recordings sync with `pStutter = null`.
 */
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
  ios: {
    extension: '.wav',
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

export default function TrainScreen() {
  const params = useLocalSearchParams<{ pathway?: string; exerciseTitle?: string; prompt?: string }>();
  const pathway: PracticePathway = params.pathway === 'pronunciation' ? 'pronunciation' : 'fluency';
  const exerciseTitle = typeof params.exerciseTitle === 'string' ? params.exerciseTitle : 'Guided speech practice';
  const prompt = typeof params.prompt === 'string' ? params.prompt : undefined;
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [isPlayingBack, setIsPlayingBack] = useState(false);
  const playbackRef = useRef<Audio.Sound | null>(null);
  const recordingUriRef = useRef<string | null>(null);
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
    transcript: string | null;
    comparison: PromptComparison | null;
    transcriptionMessage: string | null;
  } | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'offline'>('idle');
  const [easeRating, setEaseRating] = useState(50);
  const [transcriptionConsent, setTranscriptionConsent] = useState(false);

  const scale = useSharedValue(1);

  // Keep the temporary recording available for replay on this screen only.
  useEffect(() => {
    return () => {
      const sound = playbackRef.current;
      playbackRef.current = null;
      if (sound) void sound.unloadAsync().catch(() => {});
      const uri = recordingUriRef.current;
      recordingUriRef.current = null;
      if (uri) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    };
  }, []);

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

      const { recording: rec } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
      setRecording(rec);
      setRecordingUri(null);
      recordingUriRef.current = null;
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

      let transcript: string | null = null;
      let transcriptionMessage: string | null = null;
      if (transcriptionConsent) {
        try {
          transcript = await transcribeRecording(uri);
        } catch (error) {
          transcriptionMessage = error instanceof Error ? error.message : 'Speech-to-text could not run.';
        }
      }

      const analysis = await analyzeRecording({
        recordingUri: uri,
        durationSec,
        easeRating,
        transcript: transcript ?? undefined,
      });
      const comparison = pathway === 'pronunciation' && prompt && transcript
        ? comparePrompt(prompt, transcript)
        : null;

      const feedback = pathway === 'pronunciation'
        ? (transcript
          ? 'A transcript was created. Word matching is only a rough practice guide and does not measure pronunciation acoustically.'
          : 'Recording captured. Enable speech-to-text if you want a transcript-based prompt comparison.')
        : (analysis.fluencySummary ?? 'Recording captured. Take a moment to reflect on how speaking felt for you.');
      await savePracticeSession({
        id: analysis.metric.id,
        pathway,
        exerciseTitle,
        prompt,
        createdAt: analysis.metric.recordedAt,
        durationSec: analysis.metric.durationSec,
        pStutter: analysis.metric.pStutter,
        wordCount: analysis.metric.heuristic.wordCount,
        disfluencies: analysis.metric.heuristic.disfluencies,
        easeRating,
        feedback,
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
        transcript,
        comparison,
        transcriptionMessage,
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

      // Keep the temporary file only for replay while this practice screen is open.
      // It is removed when the user resets or leaves this screen.
    } catch (err) {
      console.error('Analysis failed', err);
      Alert.alert('Error', 'Could not process the recording.');
    } finally {
      setIsProcessing(false);
    }
  }

  async function togglePlayback() {
    if (!recordingUri) return;
    try {
      if (playbackRef.current && isPlayingBack) {
        await playbackRef.current.stopAsync();
        setIsPlayingBack(false);
        return;
      }
      if (playbackRef.current) {
        await playbackRef.current.unloadAsync().catch(() => {});
        playbackRef.current = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: recordingUri }, { shouldPlay: true });
      playbackRef.current = sound;
      setIsPlayingBack(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlayingBack(false);
          void sound.unloadAsync().catch(() => {});
          if (playbackRef.current === sound) playbackRef.current = null;
        }
      });
    } catch (err) {
      console.error('Playback failed', err);
      Alert.alert('Playback unavailable', 'Could not play this recording. You can still finish your practice session.');
      setIsPlayingBack(false);
    }
  }

  async function reset() {
    setResults(null);
    setSyncStatus('idle');
    setIsPlayingBack(false);
    if (playbackRef.current) {
      await playbackRef.current.unloadAsync().catch(() => {});
      playbackRef.current = null;
    }
    const uri = recordingUriRef.current;
    recordingUriRef.current = null;
    setRecordingUri(null);
    if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
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
        <ThemedText type="title">{exerciseTitle}</ThemedText>
        <ThemedText style={styles.subtitle}>{pathway === 'pronunciation' ? 'Record your attempt at your own pace.' : 'Record a short sample and reflect on how speaking felt.'}</ThemedText>
        {prompt ? <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}><ThemedText style={{ color: '#0F766E', fontWeight: '700', textAlign: 'center' }}>Practice prompt</ThemedText><ThemedText style={{ color: '#334155', fontSize: 17, lineHeight: 24, textAlign: 'center', marginTop: 5 }}>{prompt}</ThemedText></View> : null}
      </View>

      <View style={styles.content}>
        {!results && !isProcessing && (
          <>
          <View style={styles.consentCard}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <ThemedText style={styles.consentTitle}>Enable speech-to-text</ThemedText>
              <ThemedText style={styles.consentCopy}>If enabled, this recording is sent to the configured transcription service. Leave off to keep audio on this device.</ThemedText>
            </View>
            <Switch value={transcriptionConsent} onValueChange={setTranscriptionConsent} trackColor={{ false: '#CBD5E1', true: '#7AD4C0' }} thumbColor={transcriptionConsent ? '#0F766E' : '#F8FAFC'} accessibilityLabel="Send recording for speech-to-text" />
          </View>
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
          </>
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
              Practice saved
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

            {results.transcript ? (
              <View style={styles.transcriptCard}>
                <ThemedText style={styles.transcriptTitle}>Speech-to-text transcript</ThemedText>
                <ThemedText style={styles.transcriptText}>{results.transcript}</ThemedText>
                {results.comparison ? (
                  <View style={styles.comparisonBox}>
                    <ThemedText style={styles.comparisonTitle}>Prompt word match: {results.comparison.accuracyPercent}%</ThemedText>
                    <ThemedText style={styles.comparisonNote}>This compares recognized words with the prompt. It is not an acoustic pronunciation score, and the transcript may be inaccurate.</ThemedText>
                    {results.comparison.missingWords.length ? <ThemedText style={styles.comparisonLine}>Not recognized: {results.comparison.missingWords.join(', ')}</ThemedText> : null}
                    {results.comparison.extraWords.length ? <ThemedText style={styles.comparisonLine}>Other recognized words: {results.comparison.extraWords.join(', ')}</ThemedText> : null}
                    {!results.comparison.missingWords.length && !results.comparison.extraWords.length ? <ThemedText style={styles.comparisonLine}>The recognized words match the prompt.</ThemedText> : null}
                  </View>
                ) : null}
              </View>
            ) : null}
            {results.transcriptionMessage ? <ThemedText style={styles.transcriptionWarning}>{results.transcriptionMessage}</ThemedText> : null}

            {/* Fluency-only model status; pronunciation is not automatically scored. */}
            {pathway === 'fluency' ? <View style={styles.modelBadge}>
              <ThemedText style={styles.modelBadgeText}>
                {results.usedModel ? 'ONNX model active' : 'Heuristic mode (model unavailable)'}
              </ThemedText>
            </View> : null}

            {/* Core fluency stats are not shown for pronunciation sessions. */}
            {pathway === 'fluency' ? <View style={styles.metricRow}>
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
            </View> : null}

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

            {pathway === 'fluency' ? <View style={styles.metricRow}>
              {renderMetric('Words', results.wordCount)}
              {renderMetric('Rate/min', results.ratePerMin)}
              {renderMetric('Disfluencies', results.disfluencies)}
            </View> : null}

            {/* Encouraging, non-judgmental summary (ASHA-aligned) */}
            {pathway === 'fluency' && results.fluencySummary ? (
              <View style={styles.summaryCard}>
                <ThemedText style={styles.summaryText}>{results.fluencySummary}</ThemedText>
              </View>
            ) : (
              <View style={styles.summaryCard}>
                <ThemedText style={styles.summaryText}>
                  {pathway === 'pronunciation'
                    ? (transcriptionConsent ? 'Your session is saved. Speech-to-text did not return a transcript, so no prompt comparison is available.' : 'Your session is saved. Speech-to-text was off, so the recording was not sent to a transcription service.')
                    : 'Your practice session has been saved. Some automated signals may be unavailable depending on the recording format. Use these results for reflection, not as a diagnosis.'}
                </ThemedText>
              </View>
            )}

            {recordingUri ? <TouchableOpacity style={styles.retryButton} onPress={togglePlayback}>
              <ThemedText style={styles.retryText}>{isPlayingBack ? 'Stop playback' : 'Play your recording'}</ThemedText>
            </TouchableOpacity> : null}
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
  consentCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E9E2',
    borderRadius: 16,
    padding: 14,
    marginBottom: 28,
  },
  consentTitle: { color: '#173D3A', fontWeight: '800', fontSize: 14 },
  consentCopy: { color: '#667673', fontSize: 12, lineHeight: 17, marginTop: 4 },
  transcriptCard: {
    width: '100%',
    backgroundColor: '#F0FDF4',
    padding: 15,
    borderRadius: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BBE7D4',
  },
  transcriptTitle: { color: '#14532D', fontSize: 14, fontWeight: '800', marginBottom: 7 },
  transcriptText: { color: '#214B3D', fontSize: 15, lineHeight: 22 },
  comparisonBox: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#CDE8D9' },
  comparisonTitle: { color: '#14532D', fontSize: 13, fontWeight: '800' },
  comparisonNote: { color: '#42675A', fontSize: 11, lineHeight: 16, marginTop: 4 },
  comparisonLine: { color: '#315D4F', fontSize: 12, lineHeight: 18, marginTop: 7 },
  transcriptionWarning: { color: '#8A4B12', fontSize: 12, lineHeight: 18, marginTop: 10, textAlign: 'center' },
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
