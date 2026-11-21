import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

// Whisper base, multilingual, 8-bit: about 80 MB, downloaded from Hugging Face on first use, then offline.
const MODEL = 'onnx-community/whisper-base'
export const SAMPLE_RATE = 16_000
const MAX_SECONDS = 300

let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null

/** Speech to text, run on this computer. `audio` is mono 16 kHz samples; nothing is sent anywhere. */
export async function transcribe(audio: unknown, cacheDir: string): Promise<string> {
  if (!(audio instanceof Float32Array) || audio.length === 0) throw new Error('No audio was recorded')
  if (audio.length > SAMPLE_RATE * MAX_SECONDS) throw new Error('Recordings can be up to 5 minutes long')
  // Whisper invents sentences for near-silence, so a quiet recording counts as nothing heard.
  // shortcut: one loudness threshold for every microphone; make it adjustable if quiet voices get dropped.
  const rms = Math.sqrt(audio.reduce((sum, x) => sum + x * x, 0) / audio.length)
  if (rms < 0.008) return ''
  // shortcut: the model stays in memory after first use (about 200 MB); unload it if memory becomes a problem.
  loading ??= import('@huggingface/transformers').then(({ env, pipeline }) => {
    env.cacheDir = cacheDir
    return pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8' }) as Promise<AutomaticSpeechRecognitionPipeline>
  })
  let asr: AutomaticSpeechRecognitionPipeline
  try {
    asr = await loading
  } catch (error) {
    loading = null // let the next try download again, e.g. after going back online
    throw new Error(`Could not load the speech model: ${(error as Error).message}`)
  }
  // No repeated 6-word runs and a cap per 30 s chunk (speech is about 120 tokens) stop Whisper's loops.
  const out = await asr(audio, { chunk_length_s: 30, task: 'transcribe', no_repeat_ngram_size: 6, max_new_tokens: 220 })
  return (Array.isArray(out) ? out[0]! : out).text.trim()
}
