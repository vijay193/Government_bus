/**
 * Converts text to speech using the browser's Web Speech API.
 * @param text The text to be spoken.
 * @param lang The language code (e.g., 'en-US', 'hi-IN'). Defaults to 'hi-IN'.
 */
export const speak = (text: string, lang: string = 'hi-IN'): void => {
  if ('speechSynthesis' in window) {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.pitch = 1;
    utterance.rate = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
  } else {
    console.error('Text-to-speech not supported in this browser.');
  }
};
