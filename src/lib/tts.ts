import { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID } from "@/config";

export async function speak(text: string): Promise<void> {
  // Try ElevenLabs if API key is present
  if (ELEVENLABS_API_KEY) {
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text, 
          model_id: "eleven_multilingual_v2", 
          voice_settings: { stability: 0.5, similarity_boost: 0.75 } 
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        return new Promise((resolve) => { 
          audio.onended = () => { 
            URL.revokeObjectURL(url); 
            resolve(); 
          }; 
          audio.play(); 
        });
      }
    } catch {
      // Fallback on error
    }
  }
  
  // Fallback: Web Speech API
  return new Promise((resolve) => {
    // Basic fix for iOS/Safari requiring user interaction first
    // In a real kiosk this would be allowed due to user interaction starting the flow
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "id-ID";
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    } else {
      resolve();
    }
  });
}
