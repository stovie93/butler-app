import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

// On-device voice for the butler: the phone speaks Clawdia's replies (expo-speech)
// and transcribes what you say (expo-speech-recognition). No cloud, no gateway —
// it all runs on the phone, matching the app-first / keep-it-local goal.

/** Speak text aloud. Stops any current speech first. No-op on empty text. */
export function speak(text: string): void {
  const t = (text || '').trim();
  if (!t) return;
  try {
    Speech.stop();
    Speech.speak(t, { rate: 1.0, pitch: 1.05 });
  } catch {}
}

export function stopSpeaking(): void {
  try {
    Speech.stop();
  } catch {}
}

/** Begin listening. Returns false if permission is denied or it can't start. */
export async function startListening(): Promise<boolean> {
  try {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) return false;
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true, // live transcript as you talk
      continuous: false, // stop automatically when you pause
    });
    return true;
  } catch {
    return false;
  }
}

export function stopListening(): void {
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {}
}

export { useSpeechRecognitionEvent };
