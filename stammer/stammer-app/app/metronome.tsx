import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

// A short, reliable public-domain click sound.
// In production, replace with a local asset: require('../assets/sounds/tick.mp3')
const TICK_SOUND_URI = 'https://cdn.freesound.org/previews/536/536108_8311674-lq.mp3';

export default function Metronome() {
  const [bpm, setBpm] = useState(60);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundLoaded, setSoundLoaded] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Audio and load tick sound
  useEffect(() => {
    let mounted = true;

    async function initAudio() {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,   // ← ensure playback mode (not record mode from DAF screen)
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
        });

        const { sound } = await Audio.Sound.createAsync(
          { uri: TICK_SOUND_URI },
          { shouldPlay: false, volume: 1.0 }
        );
        if (mounted) {
          soundRef.current = sound;
          setSoundLoaded(true);
        }
      } catch (err) {
        console.warn('Could not load tick sound, haptics only:', err);
      }
    }

    initAudio();

    return () => {
      mounted = false;
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, []);

  const playTick = useCallback(async () => {
    // Fire haptic feedback
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    // Fire audio tick
    if (soundEnabled && soundRef.current) {
      try {
        await soundRef.current.replayAsync();
      } catch (err) {
        console.warn('Tick sound playback error:', err);
      }
    }
  }, [hapticsEnabled, soundEnabled]);

  useEffect(() => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }

    if (isPlaying) {
      const intervalMs = (60 / bpm) * 1000;
      playIntervalRef.current = setInterval(playTick, intervalMs);
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [bpm, isPlaying, playTick]);

  const togglePlay = () => {
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    if (nextPlaying) {
      playTick(); // Fire first tick immediately so there's no leading silence
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Metronome</Text>
        <Text style={styles.subtitle}>Pace your syllables to the beat</Text>
      </View>

      <View style={styles.displayContainer}>
        <Text style={styles.bpmText}>{bpm}</Text>
        <Text style={styles.bpmLabel}>BPM</Text>
      </View>

      <View style={styles.sliderContainer}>
        <Slider
          style={styles.slider}
          minimumValue={40}
          maximumValue={200}
          step={1}
          value={bpm}
          onValueChange={(val) => {
            setBpm(val);
            if (!isPlaying && hapticsEnabled) {
              Haptics.selectionAsync();
            }
          }}
          minimumTrackTintColor="#FF9800"
          maximumTrackTintColor="#FFE0B2"
          thumbTintColor="#F57C00"
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabelText}>40</Text>
          <Text style={styles.sliderLabelText}>200</Text>
        </View>
      </View>

      <View style={styles.togglesContainer}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleText}>Vibration (Haptics)</Text>
          <Switch
            value={hapticsEnabled}
            onValueChange={setHapticsEnabled}
            trackColor={{ false: '#767577', true: '#FFCC80' }}
            thumbColor={hapticsEnabled ? '#F57C00' : '#f4f3f4'}
          />
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleText}>
            Sound Tick{!soundLoaded ? ' (loading…)' : ''}
          </Text>
          <Switch
            value={soundEnabled}
            onValueChange={setSoundEnabled}
            disabled={!soundLoaded}
            trackColor={{ false: '#767577', true: '#FFCC80' }}
            thumbColor={soundEnabled ? '#F57C00' : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, isPlaying ? styles.buttonStop : styles.buttonStart]}
          onPress={togglePlay}
        >
          <Text style={styles.buttonText}>
            {isPlaying ? 'Stop' : 'Start Pacing'}
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
  displayContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#FFF3E0',
    alignSelf: 'center',
    shadowColor: '#FF9800',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 5,
  },
  bpmText: {
    fontSize: 72,
    fontWeight: '800',
    color: '#E65100',
    letterSpacing: -2,
  },
  bpmLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F57C00',
    marginTop: -5,
  },
  sliderContainer: {
    paddingHorizontal: 32,
    marginBottom: 40,
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
    color: '#999',
    fontWeight: '500',
  },
  togglesContainer: {
    paddingHorizontal: 32,
    marginBottom: 40,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  controls: {
    paddingHorizontal: 32,
    paddingBottom: 40,
    marginTop: 'auto',
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
    backgroundColor: '#FF9800',
  },
  buttonStop: {
    backgroundColor: '#D32F2F',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
