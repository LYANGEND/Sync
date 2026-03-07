"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.elevenLabsService = exports.TEACHING_VOICES = void 0;
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("../utils/prisma");
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';
// Recommended voices for teaching
exports.TEACHING_VOICES = {
    // Professional, warm, clear voices good for teaching
    RACHEL: '21m00Tcm4TlvDq8ikWAM', // American, female, calm
    DREW: '29vD33N1CtxCmqQRPOHJ', // American, male, well-rounded
    CLYDE: '2EiwWnXFnvU5JabPnv8n', // American, male, deep
    DOMI: 'AZnzlk1XvdvUeBnXmlld', // American, female, strong
    BELLA: 'EXAVITQu4vr4xnSDxMaL', // American, female, soft
    ELLI: 'MF3mGyEYCl7XYWbV9V6O', // American, female, young
    JOSH: 'TxGEqnHWrfWFTfGW9XjX', // American, male, deep
    ARNOLD: 'VR6AewLTigWG4xSOukaG', // American, male, crisp
    ADAM: 'pNInz6obpgDQGcFmaJgB', // American, male, deep
    SAM: 'yoZ06aMxZJJ28mfd3POQ', // American, male, raspy
};
class ElevenLabsService {
    constructor() {
        this.config = null;
        this.configLoadedAt = 0;
        this.CONFIG_TTL = 5 * 60 * 1000; // 5-minute cache
    }
    /**
     * Load ElevenLabs configuration from school settings or environment
     */
    loadConfig() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = Date.now();
            if (this.config && now - this.configLoadedAt < this.CONFIG_TTL) {
                return this.config;
            }
            // Try school settings first
            const settings = yield prisma_1.prisma.schoolSettings.findFirst();
            const settingsAny = settings;
            let apiKey = (settingsAny === null || settingsAny === void 0 ? void 0 : settingsAny.elevenLabsApiKey) || process.env.ELEVENLABS_API_KEY;
            if (!apiKey || apiKey.length < 10) {
                console.warn('[ElevenLabs] No API key configured');
                return null;
            }
            this.config = {
                apiKey,
                defaultVoiceId: (settingsAny === null || settingsAny === void 0 ? void 0 : settingsAny.elevenLabsVoiceId) || process.env.ELEVENLABS_VOICE_ID || exports.TEACHING_VOICES.RACHEL,
                modelId: (settingsAny === null || settingsAny === void 0 ? void 0 : settingsAny.elevenLabsModel) || process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5',
            };
            this.configLoadedAt = now;
            return this.config;
        });
    }
    /**
     * Convert text to speech using ElevenLabs API
     * Returns audio buffer (MP3 by default)
     */
    textToSpeech(text_1) {
        return __awaiter(this, arguments, void 0, function* (text, options = {}) {
            var _a, _b, _c, _d, _e, _f, _g;
            const config = yield this.loadConfig();
            if (!config) {
                console.error('[ElevenLabs] Service not configured');
                return null;
            }
            const voiceId = options.voiceId || config.defaultVoiceId;
            const modelId = options.modelId || config.modelId;
            const outputFormat = options.outputFormat || 'mp3_44100_128';
            try {
                const response = yield axios_1.default.post(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}?output_format=${outputFormat}`, {
                    text,
                    model_id: modelId,
                    voice_settings: {
                        stability: (_a = options.stability) !== null && _a !== void 0 ? _a : 0.5,
                        similarity_boost: (_b = options.similarityBoost) !== null && _b !== void 0 ? _b : 0.75,
                        style: (_c = options.style) !== null && _c !== void 0 ? _c : 0.3,
                        use_speaker_boost: (_d = options.speakerBoost) !== null && _d !== void 0 ? _d : true,
                    },
                }, {
                    headers: {
                        'xi-api-key': config.apiKey,
                        'Content-Type': 'application/json',
                        'Accept': 'audio/mpeg',
                    },
                    responseType: 'arraybuffer',
                    timeout: 30000, // 30s timeout
                });
                return {
                    audioBuffer: Buffer.from(response.data),
                    contentType: 'audio/mpeg',
                    charactersUsed: text.length,
                };
            }
            catch (error) {
                console.error('[ElevenLabs] TTS error:', ((_f = (_e = error.response) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f.toString()) || error.message);
                throw new Error(`ElevenLabs TTS failed: ${((_g = error.response) === null || _g === void 0 ? void 0 : _g.status) || error.message}`);
            }
        });
    }
    /**
     * Stream text-to-speech (returns streaming response for lower latency)
     * Used for real-time voice responses in the classroom
     */
    streamTextToSpeech(text_1) {
        return __awaiter(this, arguments, void 0, function* (text, options = {}) {
            var _a, _b, _c, _d;
            const config = yield this.loadConfig();
            if (!config) {
                throw new Error('ElevenLabs not configured');
            }
            const voiceId = options.voiceId || config.defaultVoiceId;
            const modelId = options.modelId || config.modelId;
            const outputFormat = options.outputFormat || 'mp3_44100_128';
            const response = yield axios_1.default.post(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`, {
                text,
                model_id: modelId,
                voice_settings: {
                    stability: (_a = options.stability) !== null && _a !== void 0 ? _a : 0.5,
                    similarity_boost: (_b = options.similarityBoost) !== null && _b !== void 0 ? _b : 0.75,
                    style: (_c = options.style) !== null && _c !== void 0 ? _c : 0.3,
                    use_speaker_boost: (_d = options.speakerBoost) !== null && _d !== void 0 ? _d : true,
                },
            }, {
                headers: {
                    'xi-api-key': config.apiKey,
                    'Content-Type': 'application/json',
                },
                responseType: 'stream',
                timeout: 60000,
            });
            return response.data;
        });
    }
    /**
     * List all available voices from ElevenLabs
     */
    getVoices() {
        return __awaiter(this, void 0, void 0, function* () {
            const config = yield this.loadConfig();
            if (!config) {
                throw new Error('ElevenLabs not configured');
            }
            try {
                const response = yield axios_1.default.get(`${ELEVENLABS_BASE_URL}/voices`, {
                    headers: {
                        'xi-api-key': config.apiKey,
                    },
                });
                return response.data.voices || [];
            }
            catch (error) {
                console.error('[ElevenLabs] Get voices error:', error.message);
                throw new Error('Failed to fetch voices');
            }
        });
    }
    /**
     * Get user subscription info (to check character quota)
     */
    getSubscriptionInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            const config = yield this.loadConfig();
            if (!config) {
                throw new Error('ElevenLabs not configured');
            }
            try {
                const response = yield axios_1.default.get(`${ELEVENLABS_BASE_URL}/user/subscription`, {
                    headers: {
                        'xi-api-key': config.apiKey,
                    },
                });
                return response.data;
            }
            catch (error) {
                console.error('[ElevenLabs] Subscription info error:', error.message);
                throw new Error('Failed to fetch subscription info');
            }
        });
    }
    /**
     * Generate teaching-optimized speech with appropriate pacing
     * Adds natural pauses, emphasis for educational content
     */
    teacherSpeak(text_1) {
        return __awaiter(this, arguments, void 0, function* (text, options = {}) {
            var _a, _b, _c;
            // Teaching voice settings: slightly slower, more stable, clear enunciation
            return this.textToSpeech(text, Object.assign(Object.assign({}, options), { stability: (_a = options.stability) !== null && _a !== void 0 ? _a : 0.6, similarityBoost: (_b = options.similarityBoost) !== null && _b !== void 0 ? _b : 0.8, style: (_c = options.style) !== null && _c !== void 0 ? _c : 0.2, speakerBoost: true }));
        });
    }
    /**
     * Check if the service is properly configured
     */
    isConfigured() {
        return __awaiter(this, void 0, void 0, function* () {
            const config = yield this.loadConfig();
            return config !== null;
        });
    }
}
exports.elevenLabsService = new ElevenLabsService();
exports.default = exports.elevenLabsService;
