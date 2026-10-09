import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withRepeat,
  Easing,
  cancelAnimation
} from 'react-native-reanimated';

export default function Breathing() {
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState('Ready Focus');
  
  // Animation value from 1 to 2 for scale
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.7);

  const startBreathing = () => {
    setIsActive(true);
    
    // Box breathing: 4s inhale, 4s hold, 4s exhale, 4s hold
    const duration = 4000;
    
    scale.value = withRepeat(
      withSequence(
        // Inhale (expand)
        withTiming(2, { duration, easing: Easing.inOut(Easing.ease) }),
        // Hold full
        withTiming(2, { duration }),
        // Exhale (contract)
        withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
        // Hold empty
        withTiming(1, { duration })
      ),
      -1, // Infinite repeat
      false
    );

    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration }),
        withTiming(1, { duration }),
        withTiming(0.7, { duration }),
        withTiming(0.7, { duration })
      ),
      -1,
      false
    );
  };

  const stopBreathing = () => {
    setIsActive(false);
    setPhase('Ready Focus');
    cancelAnimation(scale);
    cancelAnimation(opacity);
    scale.value = withTiming(1);
    opacity.value = withTiming(0.7);
  };

  useEffect(() => {
    let interval: ReturnType<typeof setTimeout> | undefined;
    if (isActive) {
      // Simple phase tracker based on 4s intervals
      let currentPhase = 0;
      const phases = ['Inhale...', 'Hold...', 'Exhale...', 'Hold...'];
      setPhase(phases[0]);
      
      interval = setInterval(() => {
        currentPhase = (currentPhase + 1) % 4;
        setPhase(phases[currentPhase]);
      }, 4000);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Box Breathing</Text>
        <Text style={styles.subtitle}>Relax your vocal cords before speaking</Text>
      </View>

      <View style={styles.visualizerContainer}>
        <Animated.View style={[styles.circle, animatedStyle]} />
        <Text style={styles.phaseText}>{phase}</Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, isActive ? styles.buttonStop : styles.buttonStart]}
          onPress={isActive ? stopBreathing : startBreathing}
        >
          <Text style={styles.buttonText}>
            {isActive ? 'Stop' : 'Start Exercise'}
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
  },
  circle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#80DEEA', // Calming cyan
    position: 'absolute',
  },
  phaseText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#006064',
    zIndex: 10,
  },
  controls: {
    padding: 32,
    paddingBottom: 64,
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
    backgroundColor: '#00ACC1',
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
