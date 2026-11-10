// ElevenLabs SDK client. The SDK reads ELEVENLABS_API_KEY from the environment, so run scripts with
// the key file loaded: node --env-file=<VOICE_DIR>/.env.local your-script.mjs
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { pathToFileURL } from "node:url";

// Defaults when the voice config (config.json voice_id etc.) has none. Set ELEVENLABS_VOICE_ID in
// .env.local to pick your own voice; with neither, the Voiceover panel starts on the first voice.
export const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "";
export const DEFAULT_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_v4";
export const DEFAULT_OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_192"; // best MP3 below the Pro plan

export const elevenlabs = new ElevenLabsClient();

// Text to speech in the default voice. Returns a ReadableStream of audio bytes.
export const speak = (text, { voiceId = DEFAULT_VOICE_ID, ...request } = {}) =>
  elevenlabs.textToSpeech.convert(voiceId, {
    text,
    modelId: DEFAULT_MODEL_ID,
    outputFormat: DEFAULT_OUTPUT_FORMAT,
    ...request,
  });

// Run directly to confirm the key (and the default voice, if set) without generating speech.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (DEFAULT_VOICE_ID) {
    const voice = await elevenlabs.voices.get(DEFAULT_VOICE_ID);
    console.log(`default voice: ${voice.name} (${voice.category}), ${DEFAULT_VOICE_ID}`);
  } else {
    const { voices = [] } = await elevenlabs.voices.search({ pageSize: 5 });
    console.log(`key works, ${voices.length ? "voices found" : "no voices yet"}; no default voice set`);
  }
}
