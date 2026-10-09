import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';

type DAFStatus = 'standby' | 'recording' | 'playing';

export default function DAFEngine() {
  const [isActive, setIsActive] = useState(false);
  const [delayMs, setDelayMs] = useState(100);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [dafStatus, setDafStatus] = useState<DAFStatus>('standby');

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const isActiveRef = useRef(false);
  const delayMsRef = useRef(delayMs);

  // Keep delayMsRef current so the async loop always uses the latest value
  useEffect(() => {
    delayMsRef.current = delayMs;
  }, [delayMs]);

  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();

    return () => {
      cleanup();
    };
  }, []);

  const cleanup = async () => {
    isActiveRef.current = false;
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
      recordingRef.current = null;
    }
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
  };

  const runDAFCycle = useCallback(async () => {
    if (!isActiveRef.current) return;

    try {
      // --- Phase 1: Record for delayMs duration ---
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.LOW_QUALITY
      );
      recordingRef.current = recording;
      setDafStatus('recording');

      await new Promise<void>(resolve => setTimeout(resolve, delayMsRef.current));

      if (!isActiveRef.current) {
        await recording.stopAndUnloadAsync();
        recordingRef.current = null;
        return;
      }

      // --- Phase 2: Stop recording and capture URI ---
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri || !isActiveRef.current) return;

      // --- Phase 3: Switch to playback mode and play back ---
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      setDafStatus('playing');
      await sound.playAsync();

      // Wait for playback to finish before looping
      await new Promise<void>(resolve => {
        sound.setOnPlaybackStatusUpdate(status => {
          if (status.isLoaded && status.didJustFinish) resolve();
        });
      });

      await sound.unloadAsync();
      soundRef.current = null;

      // --- Phase 4: Loop ---
      if (isActiveRef.current) {
        runDAFCycle();
      } else {
        setDafStatus('standby');
      }
    } catch (err) {
      console.error('DAF cycle error:', err);
      // Attempt to recover and keep looping if still active
      if (isActiveRef.current) {
        setTimeout(() => runDAFCycle(), 200);
      }
    }
  }, []);

  const startDAF = async () => {
    if (!hasPermission) {
      Alert.alert('Permission Required', 'Please allow microphone access to use DAF.');
      return;
    }

    isActiveRef.current = true;
    setIsActive(true);

    Alert.alert(
      'Headphones Recommended',
      'Please use wired headphones to prevent audio feedback loops and ensure the best experience.',
      [{ text: "I'm ready", onPress: runDAFCycle }]
    );
  };

  const stopDAF = async () => {
    setIsActive(false);
    setDafStatus('standby');
    await cleanup();
  };

  const toggleDAF = () => {
    if (isActive) {
      stopDAF();
    } else {
      startDAF();
    }
  };

  const statusLabel: Record<DAFStatus, string> = {
    standby: 'Standby',
    recording: 'Recording...',
    playing: 'Playing Back...',
  };

  const statusColor: Record<DAFStatus, string> = {
    standby: '#9E9E9E',
    recording: '#3F51B5',
    playing: '#00897B',
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>DAF Engine</Text>
        <Text style={styles.subtitle}>Delayed Auditory Feedback</Text>
      </View>

      <View style={styles.visualizerContainer}>
        <View style={[
          styles.statusIndicator,
          isActive ? styles.statusActive : styles.statusInactive,
          { borderColor: isActive ? statusColor[dafStatus] : '#E0E0E0' }
        ]}>
          {isActive && <View style={[styles.pulseRing, { borderColor: statusColor[dafStatus] }]} />}
          <Text style={[styles.statusText, { color: statusColor[dafStatus] }]}>
            {statusLabel[dafStatus]}
          </Text>
        </View>
        <Text style={styles.warningText}>
          *Headphones strongly recommended to avoid feedback loops
        </Text>
      </View>

      <View style={styles.controlsContainer}>
        <Text style={styles.sliderLabel}>Delay: {delayMs} ms</Text>
        <Slider
          style={styles.slider}
          minimumValue={50}
          maximumValue={250}
          step={10}
          value={delayMs}
          onValueChange={setDelayMs}
          disabled={isActive}
          minimumTrackTintColor="#3F51B5"
          maximumTrackTintColor="#C5CAE9"
          thumbTintColor="#3949AB"
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabelText}>50ms</Text>
          <Text style={styles.sliderLabelText}>250ms</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, isActive ? styles.buttonStop : styles.buttonStart]}
          onPress={toggleDAF}
        >
          <Text style={styles.buttonText}>
            {isActive ? 'Stop DAF' : 'Activate DAF Loop'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  visualizerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  statusIndicator: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
    borderWidth: 2,
  },
  statusInactive: {
    backgroundColor: '#EEEEEE',
  },
  statusActive: {
    backgroundColor: '#E8EAF6',
  },
  pulseRing: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 1,
    opacity: 0.3,
  },
  statusText: {
    fontSize: 20,
    fontWeight: '600',
  },
  warningText: {
    color: '#757575',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
  controlsContainer: {
    paddingHorizontal: 32,
    marginBottom: 40,
  },
  sliderLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3949AB',
    marginBottom: 16,
    textAlign: 'center',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  sliderLabelText: {
    color: '#9E9E9E',
    fontWeight: '500',
  },
  controls: {
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  button: {
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonStart: {
    backgroundColor: '#3F51B5',
  },
  buttonStop: {
    backgroundColor: '#E53935',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
