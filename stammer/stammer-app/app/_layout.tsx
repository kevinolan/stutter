import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Home', headerShown: false }} />
      <Stack.Screen name="train" options={{ title: 'Speech Training' }} />
      <Stack.Screen name="breathing" options={{ title: 'Breathing Exercises' }} />
      <Stack.Screen name="metronome" options={{ title: 'Metronome' }} />
      <Stack.Screen name="reading" options={{ title: 'Reading Practice' }} />
      <Stack.Screen name="daf" options={{ title: 'DAF Engine' }} />
    </Stack>
  );
}
