import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';

// Sample practice text
const PRACTICE_TEXT = `This is a practice reading exercise. The goal is to read each word at a steady, rhythmic pace. Try not to rush. Focus on breathing smoothly and linking your words together. Speech therapy techniques like this can help build confidence and train your brain to speak more fluidly. Take your time, and remember that pausing is perfectly fine.`.split(' ');

export default function ReadingPractice() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [wordsPerMinute, setWordsPerMinute] = useState(100);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Always clear the previous interval first to prevent double-ticking
    // when wordsPerMinute changes while isPlaying is true.
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }

    if (isPlaying) {
      const msPerWord = (60 / wordsPerMinute) * 1000;

      playIntervalRef.current = setInterval(() => {
        setCurrentWordIndex((prev) => {
          if (prev >= PRACTICE_TEXT.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, msPerWord);
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [isPlaying, wordsPerMinute]);

  const toggleReading = () => {
    if (currentWordIndex >= PRACTICE_TEXT.length - 1) {
      setCurrentWordIndex(0); // Reset if at the end
    }
    setIsPlaying(!isPlaying);
  };

  const resetReading = () => {
    setIsPlaying(false);
    setCurrentWordIndex(0);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Guided Reading</Text>
        <Text style={styles.subtitle}>Read along with the highlight</Text>
      </View>

      <View style={styles.speedControl}>
        <Text style={styles.speedLabel}>Reading Speed: {wordsPerMinute} WPM</Text>
        <Slider
          style={styles.slider}
          minimumValue={60}
          maximumValue={200}
          step={5}
          value={wordsPerMinute}
          onValueChange={setWordsPerMinute}
          minimumTrackTintColor="#9C27B0"
          maximumTrackTintColor="#E1BEE7"
          thumbTintColor="#8E24AA"
          disabled={isPlaying} // Don't allow changing speed while running to prevent jitter
        />
      </View>

      <ScrollView 
        ref={scrollViewRef}
        style={styles.textArea} 
        contentContainerStyle={styles.textContainer}
      >
        <View style={styles.wordsWrapper}>
          {PRACTICE_TEXT.map((word, index) => {
            const isHighlighted = index === currentWordIndex;
            const isPassed = index < currentWordIndex;
            
            return (
              <Text 
                key={index} 
                style={[
                  styles.word, 
                  isHighlighted && styles.wordHighlighted,
                  isPassed && styles.wordPassed,
                ]}
              >
                {word}{' '}
              </Text>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.button, styles.buttonReset]}
          onPress={resetReading}
        >
          <Text style={styles.buttonTextSecondary}>Reset</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, isPlaying ? styles.buttonStop : styles.buttonStart]}
          onPress={toggleReading}
        >
          <Text style={styles.buttonTextPrimary}>
            {isPlaying ? 'Pause' : (currentWordIndex === 0 ? 'Start Reading' : 'Resume')}
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
    marginTop: 10,
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
  speedControl: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  speedLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6A1B9A',
    marginBottom: 10,
    textAlign: 'center',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  textArea: {
    flex: 1,
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  textContainer: {
    padding: 24,
  },
  wordsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  word: {
    fontSize: 28,
    lineHeight: 44,
    color: '#9E9E9E',
    fontWeight: '500',
  },
  wordPassed: {
    color: '#1A1A1A', // Dark text once read
  },
  wordHighlighted: {
    color: '#AB47BC', // Purple highlight
    fontWeight: '700',
    backgroundColor: '#F3E5F5',
    borderRadius: 8,
    overflow: 'hidden',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 16,
  },
  button: {
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonReset: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  buttonStart: {
    backgroundColor: '#8E24AA', // Deep purple
  },
  buttonStop: {
    backgroundColor: '#E53935',
  },
  buttonTextPrimary: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  buttonTextSecondary: {
    color: '#424242',
    fontSize: 18,
    fontWeight: '700',
  },
});
