import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="pronunciation" options={{ title: 'Pronunciation practice', headerTintColor: '#0F766E', headerBackTitle: 'Back' }} />
      <Stack.Screen name="fluency" options={{ title: 'Fluency practice', headerTintColor: '#0F766E', headerBackTitle: 'Back' }} />
      <Stack.Screen name="train" options={{ title: 'Speech practice', headerTintColor: '#0F766E', headerBackTitle: 'Back' }} />
      <Stack.Screen name="breathing" options={{ title: 'Breathing practice', headerTintColor: '#0F766E', headerBackTitle: 'Back' }} />
      <Stack.Screen name="metronome" options={{ title: 'Speech rhythm', headerTintColor: '#0F766E', headerBackTitle: 'Back' }} />
      <Stack.Screen name="reading" options={{ title: 'Guided reading', headerTintColor: '#0F766E', headerBackTitle: 'Back' }} />
      <Stack.Screen name="daf" options={{ title: 'Delayed auditory feedback', headerTintColor: '#0F766E', headerBackTitle: 'Back' }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Details' }} />
    </Stack>
  );
}
