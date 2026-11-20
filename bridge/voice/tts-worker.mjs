// ElevenLabs worker for the Kino "Voiceover" panel.
//
// The Kino bridge spawns this as `node --env-file=<VOICE_DIR>/.env.local tts-worker.mjs` with a minimal env, so
// ELEVENLABS_API_KEY exists only in this process: never in the bridge, its terminal shells or the panel.
// Protocol: one JSON object per line. stdin {id, cmd, args}; stdout {id, ok: true, result} or
// {id, ok: false, error}. Nothing else may be written to stdout.
//
// Requests use the API's snake_case fields, the same ones the .json sidecars store, and are converted
// to the SDK's camelCase here. Output files are named
//   <output_dir>/YYYYmmdd-HHMMSS_<slug>_v<N>.<ext> plus a .json sidecar with the exact request.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";

// The bridge passes these paths in (see bridge/platform.mjs); the fallbacks are the macOS layout.
const HOME = os.homedir();
const CONFIG_PATH = process.env.KINO_TTS_CONFIG || path.join(HOME, ".config", "elevenlabs-voice", "config.json");
const DEFAULT_OUT = process.env.KINO_TTS_OUT || path.join(HOME, "Documents", "ElevenLabs Voiceover");
const ENV_FILE = process.env.KINO_TTS_ENV_FILE || path.join(process.cwd(), ".env.local");
const FFPROBE = process.env.KINO_FFPROBE || "ffprobe";
const FORMATS = new Set(["mp3_44100_192", "mp3_44100_128", "mp3_44100_96", "mp3_22050_32", "wav_44100", "wav_48000", "wav_24000", "wav_22050", "wav_16000", "opus_48000_128", "opus_48000_192"]);
const NORMALIZATION = new Set(["auto", "on", "off"]);
const ID = /^[A-Za-z0-9_-]{6,64}$/;
const MODEL = /^[a-z0-9_]{3,64}$/;
const LANGUAGE = /^[a-z]{2,3}$/;
const MAX_TAKES = 4;
const SEED_MAX = 4294967295;

const require = createRequire(import.meta.url);
const sdkVersion = (() => {
  try {
    return require("@elevenlabs/elevenlabs-js/package.json").version;
  } catch {
    return null;
  }
})();

const hasKey = Boolean(process.env.ELEVENLABS_API_KEY);
let client = null;
let defaults = { DEFAULT_VOICE_ID: process.env.ELEVENLABS_VOICE_ID || "", DEFAULT_MODEL_ID: "eleven_v4", DEFAULT_OUTPUT_FORMAT: "mp3_44100_128" };
if (hasKey) {
  const mod = await import("./client.mjs");
  client = mod.elevenlabs;
  defaults = mod;
}

const loadConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
};
const outputDir = () => {
  const dir = loadConfig().output_dir;
  return typeof dir === "string" && dir ? dir.replace(/^~(?=[\\/])/, HOME) : DEFAULT_OUT;
};

const requireClient = () => {
  if (!client) throw new Error(`No ElevenLabs API key in ${ENV_FILE}. The Voiceover panel shows how to connect your account.`);
  return client;
};

// ---------- helpers ----------
const num = (value, min, max) => {
  const n = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(n) ? undefined : Math.min(Math.max(n, min), max);
};
const str = (value, max) => (typeof value === "string" && value.trim() ? value.slice(0, max) : undefined);
// ElevenLabs copy uses long dashes; the panel must not show them.
const plainDash = value => (typeof value === "string" ? value.replace(/\s*[\u2014\u2013]\s*/g, ", ") : value);
const drop = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

// Letters and digits of any script stay, so a take in Polish, Greek or Japanese still gets a readable name.
const slugify = (text, n = 48) => {
  const s = text.normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return [...s].slice(0, n).join("").replace(/-+$/, "") || "vo";
};
const stamp = date => {
  const p = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
};
const localIso = date => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 19);
};

const probeDuration = file =>
  new Promise(resolve =>
    execFile(
      FFPROBE,
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      { timeout: 30000, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("ELEVENLABS_"))), windowsHide: true },
      (error, stdout) => {
        const value = Number(String(stdout).trim());
        resolve(error || !Number.isFinite(value) ? null : Math.round(value * 1000) / 1000);
      },
    ),
  );

const readStream = async stream => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

const describeError = error => {
  const body = error?.body;
  const detail = body?.detail;
  const message =
    (typeof detail === "string" && detail) ||
    (detail && typeof detail.message === "string" && detail.message) ||
    (Array.isArray(detail) && detail.map(item => item?.msg).filter(Boolean).join("; ")) ||
    error?.message ||
    String(error);
  const status = error?.statusCode ? ` (${error.statusCode})` : "";
  return `${message}${status}`.replace(/sk_[A-Za-z0-9]{8,}/g, "sk_…").slice(0, 600);
};

/** The takes folder, created and checked before any credits are spent on audio that cannot be saved. */
const writableOutputDir = () => {
  const dir = outputDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (error) {
    throw new Error(`Cannot write to ${dir} (${error.code ?? error.message}). Pick another folder with Folder > Change.`);
  }
  return dir;
};
const saveError = (error, dir) =>
  error?.code === "ENOSPC"
    ? new Error(`The disk is full, so the take could not be saved to ${dir}. The credits for it were already used.`)
    : error?.code === "EACCES" || error?.code === "EPERM"
      ? new Error(`Cannot write to ${dir}, so the take could not be saved. The credits for it were already used.`)
      : error;

// ---------- snake_case request -> SDK request ----------
const cleanRequest = args => {
  const text = typeof args.text === "string" ? args.text.replace(/\r\n/g, "\n").trim() : "";
  if (!text) throw new Error("Write something to say first.");
  if (text.length > 40000) throw new Error("That text is over 40,000 characters. Split it into parts.");
  const voiceId = String(args.voice_id ?? "");
  if (!ID.test(voiceId)) throw new Error("Pick a voice.");
  const modelId = String(args.model_id ?? defaults.DEFAULT_MODEL_ID);
  if (!MODEL.test(modelId)) throw new Error("Pick a model.");
  const outputFormat = FORMATS.has(args.output_format) ? args.output_format : defaults.DEFAULT_OUTPUT_FORMAT;

  const vs = args.voice_settings ?? {};
  const voiceSettings = drop({
    stability: num(vs.stability, 0, 1),
    similarity_boost: num(vs.similarity_boost, 0, 1),
    style: num(vs.style, 0, 1),
    speed: num(vs.speed, 0.7, 1.2),
    use_speaker_boost: typeof vs.use_speaker_boost === "boolean" ? vs.use_speaker_boost : undefined,
    clone_strength: num(vs.clone_strength, 0, 1),
  });
  const locators = Array.isArray(args.pronunciation_dictionary_locators)
    ? args.pronunciation_dictionary_locators
        .filter(item => ID.test(String(item?.pronunciation_dictionary_id ?? "")))
        .slice(0, 3)
        .map(item => drop({ pronunciation_dictionary_id: item.pronunciation_dictionary_id, version_id: ID.test(String(item.version_id ?? "")) ? item.version_id : undefined }))
    : [];
  const fx = args.audio_effects ?? {};
  const effects = drop({
    filter_preset_id: str(fx.filter_preset_id, 64),
    environment_id: str(fx.environment_id, 64),
    background_noise_id: str(fx.background_noise_id, 64),
    distance: num(fx.distance, 0, 1),
    send_level: num(fx.send_level, 0, 1),
    pan: num(fx.pan, -1, 1),
  });
  const hasEffects = Boolean(effects.filter_preset_id || effects.environment_id || effects.background_noise_id || effects.pan || effects.distance);

  return drop({
    text,
    model_id: modelId,
    voice_settings: Object.keys(voiceSettings).length ? voiceSettings : undefined,
    seed: num(args.seed, 0, SEED_MAX) !== undefined ? Math.floor(num(args.seed, 0, SEED_MAX)) : undefined,
    language_code: typeof args.language_code === "string" && LANGUAGE.test(args.language_code) ? args.language_code : undefined,
    previous_text: str(args.previous_text, 5000),
    next_text: str(args.next_text, 5000),
    apply_text_normalization: NORMALIZATION.has(args.apply_text_normalization) && args.apply_text_normalization !== "auto" ? args.apply_text_normalization : undefined,
    pronunciation_dictionary_locators: locators.length ? locators : undefined,
    audio_effects: hasEffects ? effects : undefined,
    use_pvc_as_ivc: args.use_pvc_as_ivc === true ? true : undefined,
    _voice_id: voiceId,
    _output_format: outputFormat,
  });
};

const toSdk = (body, seed) =>
  drop({
    text: body.text,
    modelId: body.model_id,
    outputFormat: body._output_format,
    seed,
    languageCode: body.language_code,
    previousText: body.previous_text,
    nextText: body.next_text,
    applyTextNormalization: body.apply_text_normalization,
    usePvcAsIvc: body.use_pvc_as_ivc,
    voiceSettings: body.voice_settings
      ? drop({
          stability: body.voice_settings.stability,
          similarityBoost: body.voice_settings.similarity_boost,
          style: body.voice_settings.style,
          speed: body.voice_settings.speed,
          useSpeakerBoost: body.voice_settings.use_speaker_boost,
          cloneStrength: body.voice_settings.clone_strength,
        })
      : undefined,
    pronunciationDictionaryLocators: body.pronunciation_dictionary_locators?.map(item =>
      drop({ pronunciationDictionaryId: item.pronunciation_dictionary_id, versionId: item.version_id }),
    ),
    audioEffects: body.audio_effects
      ? drop({
          filterPresetId: body.audio_effects.filter_preset_id,
          environmentId: body.audio_effects.environment_id,
          backgroundNoiseId: body.audio_effects.background_noise_id,
          distance: body.audio_effects.distance,
          sendLevel: body.audio_effects.send_level,
          pan: body.audio_effects.pan,
        })
      : undefined,
  });

const uniquePath = (dir, stem, ext) => {
  let candidate = path.join(dir, `${stem}.${ext}`);
  for (let n = 2; fs.existsSync(candidate) || fs.existsSync(candidate.replace(/\.\w+$/, ".json")); n += 1) candidate = path.join(dir, `${stem}-${n}.${ext}`);
  return candidate;
};

const convertOnce = async (voiceId, request) => {
  const { data, rawResponse } = await requireClient().textToSpeech.convert(voiceId, request, { timeoutInSeconds: 240, maxRetries: 1 }).withRawResponse();
  const audio = await readStream(data);
  const headers = rawResponse?.headers;
  return {
    audio,
    requestId: headers?.get?.("request-id") ?? headers?.get?.("history-item-id") ?? null,
    characterCost: headers?.get?.("character-cost") ?? headers?.get?.("x-character-count") ?? null,
  };
};

// ---------- commands ----------
const commands = {
  async status() {
    const cfg = loadConfig();
    return {
      hasKey,
      sdk: sdkVersion,
      outputDir: outputDir(),
      defaults: {
        voiceId: cfg.voice_id || defaults.DEFAULT_VOICE_ID || null,
        voiceName: cfg.voice_name ?? null,
        modelId: cfg.model_id || defaults.DEFAULT_MODEL_ID,
        outputFormat: cfg.output_format || defaults.DEFAULT_OUTPUT_FORMAT,
        voiceSettings: cfg.voice_settings ?? {},
      },
    };
  },

  async voices() {
    const el = requireClient();
    const voices = [];
    let nextPageToken;
    for (let page = 0; page < 6; page += 1) {
      const response = await el.voices.search(drop({ pageSize: 100, nextPageToken }));
      voices.push(...(response.voices ?? []));
      if (!response.hasMore || !response.nextPageToken) break;
      nextPageToken = response.nextPageToken;
    }
    return voices.map(voice => ({
      id: voice.voiceId,
      name: voice.name ?? voice.voiceId,
      category: voice.category ?? "unknown",
      labels: voice.labels ?? {},
      description: plainDash(voice.description) ?? null,
      previewUrl: voice.previewUrl ?? null,
      fineTuned: Object.entries(voice.fineTuning?.state ?? {})
        .filter(([, state]) => state === "fine_tuned")
        .map(([model]) => model),
      settings: voice.settings
        ? drop({
            stability: voice.settings.stability,
            similarity_boost: voice.settings.similarityBoost,
            style: voice.settings.style,
            speed: voice.settings.speed,
            use_speaker_boost: voice.settings.useSpeakerBoost,
          })
        : null,
    }));
  },

  async models() {
    const models = await requireClient().models.list();
    return models
      .filter(model => model.canDoTextToSpeech)
      .map(model => ({
        id: model.modelId,
        name: model.name ?? model.modelId,
        description: plainDash(model.description) ?? "",
        canUseStyle: model.canUseStyle !== false,
        canUseSpeakerBoost: model.canUseSpeakerBoost !== false,
        maxChars: model.maximumTextLengthPerRequest ?? model.maxCharactersRequestSubscribedUser ?? null,
        costFactor: model.modelRates?.characterCostMultiplier ?? model.tokenCostFactor ?? 1,
        languages: (model.languages ?? []).map(language => ({ id: language.languageId, name: language.name })),
        alpha: Boolean(model.requiresAlphaAccess),
      }));
  },

  // The voice list does not carry saved settings, and a partial voice_settings override would fill the
  // missing fields with API defaults. The panel reads these to show real defaults and to merge overrides.
  async voiceSettings(args) {
    const voiceId = String(args?.voice ?? "");
    if (!ID.test(voiceId)) throw new Error("Pick a voice.");
    const settings = await requireClient().voices.settings.get(voiceId);
    return drop({
      stability: settings?.stability,
      similarity_boost: settings?.similarityBoost,
      style: settings?.style,
      speed: settings?.speed,
      use_speaker_boost: settings?.useSpeakerBoost,
    });
  },

  async quota() {
    const sub = await requireClient().user.subscription.get();
    return { tier: sub.tier, used: sub.characterCount, limit: sub.characterLimit, resetUnix: sub.nextCharacterCountResetUnix ?? null };
  },

  async dictionaries() {
    const response = await requireClient().pronunciationDictionaries.list({ pageSize: 30 });
    return (response.pronunciationDictionaries ?? [])
      .filter(dict => !dict.archivedTimeUnix)
      .map(dict => ({ id: dict.id, versionId: dict.latestVersionId, name: dict.name, rules: dict.latestVersionRulesNum, description: dict.description ?? null }));
  },

  async effects() {
    const catalog = await requireClient().audioEffects.getCatalog();
    return {
      filters: (catalog.filterPresets ?? []).map(item => ({ id: item.filterPresetId, name: plainDash(item.name), description: plainDash(item.description) ?? null })),
      environments: (catalog.environments ?? []).map(item => ({ id: item.environmentId, name: plainDash(item.name), description: plainDash(item.description) ?? null })),
      noises: (catalog.backgroundNoises ?? []).map(item => ({ id: item.backgroundNoiseId, name: plainDash(item.name), description: plainDash(item.description) ?? null })),
    };
  },

  async generate(args) {
    requireClient();
    const body = cleanRequest(args);
    const takes = Math.min(Math.max(Math.floor(Number(args.takes) || 1), 1), MAX_TAKES);
    const voiceName = str(args.voice_name, 120) ?? null;
    const dir = writableOutputDir();

    const now = new Date();
    const plain = body.text.replace(/\[[^\]]*\]|<[^>]*>|\/[^/\s][^/]*\//g, " ");
    const stem = `${stamp(now)}_${slugify(str(args.name, 80) ?? plain.split(/\s+/).filter(Boolean).slice(0, 8).join(" "))}`;
    const batch = `${stem}-${crypto.randomBytes(3).toString("hex")}`;
    const ext = body._output_format.split("_")[0];
    const seeds = Array.from({ length: takes }, (_, i) => (body.seed !== undefined ? (body.seed + i) % (SEED_MAX + 1) : crypto.randomInt(0, 2 ** 32 - 1)));

    const runTake = async index => {
      const seed = seeds[index];
      let result;
      try {
        result = await convertOnce(body._voice_id, toSdk(body, seed));
      } catch (error) {
        if (error?.statusCode !== 429) throw error;
        await new Promise(resolve => setTimeout(resolve, 1500 + index * 700));
        result = await convertOnce(body._voice_id, toSdk(body, seed));
      }
      const file = uniquePath(dir, `${stem}_v${index + 1}`, ext);
      try {
        fs.writeFileSync(file, result.audio);
      } catch (error) {
        throw saveError(error, dir);
      }
      const duration = await probeDuration(file);
      const { _voice_id, _output_format, seed: _seed, ...request } = body;
      const meta = {
        file,
        duration_s: duration,
        voice_id: body._voice_id,
        voice_name: voiceName,
        model_id: body.model_id,
        output_format: body._output_format,
        characters: body.text.length,
        request: { ...request, seed },
        request_id: result.requestId,
        character_cost: result.characterCost,
        created: localIso(now),
        source: "kino-voiceover-panel",
        batch,
        take: index + 1,
        takes,
      };
      try {
        fs.writeFileSync(file.replace(/\.\w+$/, ".json"), `${JSON.stringify(meta, null, 2)}\n`);
      } catch (error) {
        throw saveError(error, dir);
      }
      return meta;
    };

    const settled = await Promise.allSettled(seeds.map((_, index) => runTake(index)));
    const results = settled.map((entry, index) =>
      entry.status === "fulfilled" ? entry.value : { batch, take: index + 1, takes, seed: seeds[index], error: describeError(entry.reason) },
    );
    if (results.every(item => item.error)) throw new Error(results[0].error);
    return { batch, takes: results };
  },
};

// ---------- stdio loop ----------
const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", async line => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const command = commands[message?.cmd];
  if (!command) return send({ id: message?.id, ok: false, error: `unknown command ${message?.cmd}` });
  try {
    send({ id: message.id, ok: true, result: await command(message.args ?? {}) });
  } catch (error) {
    send({ id: message.id, ok: false, error: describeError(error), status: error?.statusCode ?? null });
  }
});
lines.on("close", () => process.exit(0));
