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
exports.aiService = void 0;
const prisma_1 = require("../utils/prisma");
const axios_1 = __importDefault(require("axios"));
/**
 * Core AI Service - handles communication with AI providers
 * Supports: Azure OpenAI, OpenAI, Anthropic, Google Gemini
 * Used by all AI-powered features: auto-grading, report remarks, risk analysis, financial advisor, etc.
 */
class AIService {
    constructor() {
        this.config = null;
        this.configLoadedAt = 0;
        this.CONFIG_TTL = 5 * 60 * 1000; // Cache config for 5 minutes
    }
    /** Check if an env var has a real value (not empty or placeholder) */
    isValidEnvVar(value) {
        return !!value && value !== 'not-set' && value !== 'placeholder' && value.length > 3;
    }
    /**
     * Load AI configuration from school settings, falling back to .env variables
     */
    loadConfig() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = Date.now();
            if (this.config && now - this.configLoadedAt < this.CONFIG_TTL) {
                return this.config;
            }
            // Try loading from school settings first
            const settings = yield prisma_1.prisma.schoolSettings.findFirst();
            if (settings && settings.aiEnabled && settings.aiApiKey) {
                const provider = settings.aiProvider || 'openai';
                this.config = {
                    provider,
                    apiKey: settings.aiApiKey,
                    model: settings.aiModel || 'gpt-4o-mini',
                    enabled: settings.aiEnabled,
                };
                // For Azure provider, merge in Azure-specific env vars that aren't stored in DB
                if (provider === 'azure') {
                    this.config.azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
                    this.config.azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview';
                    this.config.azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT || this.config.model;
                    // If the API key from DB doesn't look like an Azure key, prefer the env var
                    if (this.isValidEnvVar(process.env.AZURE_OPENAI_API_KEY)) {
                        this.config.apiKey = process.env.AZURE_OPENAI_API_KEY;
                    }
                    // Azure requires an endpoint — if missing, fall through to env var fallbacks
                    if (!this.isValidEnvVar(this.config.azureEndpoint)) {
                        this.config = null;
                        // Don't return — let it fall through to env var-based config below
                    }
                    else {
                        this.configLoadedAt = now;
                        return this.config;
                    }
                }
                else {
                    this.configLoadedAt = now;
                    return this.config;
                }
            }
            // Fallback: check for Azure OpenAI env vars
            if (this.isValidEnvVar(process.env.AZURE_OPENAI_API_KEY) && this.isValidEnvVar(process.env.AZURE_OPENAI_ENDPOINT)) {
                this.config = {
                    provider: 'azure',
                    apiKey: process.env.AZURE_OPENAI_API_KEY,
                    model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
                    enabled: true,
                    azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
                    azureApiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
                    azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
                };
                this.configLoadedAt = now;
                return this.config;
            }
            // Fallback: check for standard OpenAI env var
            if (this.isValidEnvVar(process.env.OPENAI_API_KEY)) {
                this.config = {
                    provider: 'openai',
                    apiKey: process.env.OPENAI_API_KEY,
                    model: 'gpt-4o-mini',
                    enabled: true,
                };
                this.configLoadedAt = now;
                return this.config;
            }
            // Fallback: check for Google Gemini env var
            if (this.isValidEnvVar(process.env.GEMINI_API_KEY)) {
                this.config = {
                    provider: 'gemini',
                    apiKey: process.env.GEMINI_API_KEY,
                    model: 'gemini-2.0-flash',
                    enabled: true,
                };
                this.configLoadedAt = now;
                return this.config;
            }
            this.config = null;
            return null;
        });
    }
    /**
     * Check if AI is configured and enabled
     */
    isAvailable() {
        return __awaiter(this, void 0, void 0, function* () {
            const config = yield this.loadConfig();
            return config !== null && config.enabled;
        });
    }
    /**
     * Send a chat completion request to the AI provider
     */
    chat(messages, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const config = yield this.loadConfig();
            if (!config) {
                throw new Error('AI is not configured. Please set up AI in School Settings.');
            }
            const temperature = (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.7;
            const maxTokens = (_b = options === null || options === void 0 ? void 0 : options.maxTokens) !== null && _b !== void 0 ? _b : 2000;
            const model = (options === null || options === void 0 ? void 0 : options.model) || config.model;
            try {
                if (config.provider === 'azure') {
                    return yield this.chatAzureOpenAI(config, messages, temperature, maxTokens);
                }
                else if (config.provider === 'openai') {
                    return yield this.chatOpenAI(config.apiKey, model, messages, temperature, maxTokens);
                }
                else if (config.provider === 'anthropic') {
                    return yield this.chatAnthropic(config.apiKey, model, messages, temperature, maxTokens);
                }
                else if (config.provider === 'gemini') {
                    return yield this.chatGemini(config.apiKey, model, messages, temperature, maxTokens);
                }
                else {
                    throw new Error(`Unsupported AI provider: ${config.provider}`);
                }
            }
            catch (error) {
                const details = ((_c = error.response) === null || _c === void 0 ? void 0 : _c.data) ? JSON.stringify(error.response.data) : error.message;
                console.error('AI service error:', details);
                throw new Error(`AI request failed: ${details}`);
            }
        });
    }
    /**
     * OpenAI Chat Completion
     */
    chatOpenAI(apiKey, model, messages, temperature, maxTokens) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const response = yield axios_1.default.post('https://api.openai.com/v1/chat/completions', {
                model,
                messages,
                temperature,
                max_tokens: maxTokens,
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 60000,
            });
            return {
                content: response.data.choices[0].message.content,
                tokensUsed: (_a = response.data.usage) === null || _a === void 0 ? void 0 : _a.total_tokens,
                model: response.data.model,
            };
        });
    }
    /**
     * Azure OpenAI Chat Completion
     */
    chatAzureOpenAI(config, messages, temperature, maxTokens) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const endpoint = config.azureEndpoint.replace(/\/$/, '');
            const deployment = config.azureDeployment || config.model;
            const apiVersion = config.azureApiVersion || '2024-12-01-preview';
            const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
            // Some models (o-series, gpt-5.x) don't support temperature or max_tokens
            const isReasoningModel = /^(o[1-9]|gpt-5)/i.test(deployment);
            const body = {
                messages,
                max_completion_tokens: maxTokens,
            };
            if (!isReasoningModel) {
                body.temperature = temperature;
            }
            const response = yield axios_1.default.post(url, body, {
                headers: {
                    'api-key': config.apiKey,
                    'Content-Type': 'application/json',
                },
                timeout: 120000,
            });
            return {
                content: response.data.choices[0].message.content,
                tokensUsed: (_a = response.data.usage) === null || _a === void 0 ? void 0 : _a.total_tokens,
                model: response.data.model,
            };
        });
    }
    /**
     * Anthropic Chat Completion
     */
    chatAnthropic(apiKey, model, messages, temperature, maxTokens) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            // Separate system message from conversation
            const systemMessage = messages.find(m => m.role === 'system');
            const conversationMessages = messages.filter(m => m.role !== 'system');
            const response = yield axios_1.default.post('https://api.anthropic.com/v1/messages', {
                model: model || 'claude-3-haiku-20240307',
                max_tokens: maxTokens,
                temperature,
                system: (systemMessage === null || systemMessage === void 0 ? void 0 : systemMessage.content) || '',
                messages: conversationMessages.map(m => ({
                    role: m.role,
                    content: m.content,
                })),
            }, {
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01',
                },
                timeout: 60000,
            });
            return {
                content: response.data.content[0].text,
                tokensUsed: ((_a = response.data.usage) === null || _a === void 0 ? void 0 : _a.input_tokens) + ((_b = response.data.usage) === null || _b === void 0 ? void 0 : _b.output_tokens),
                model: response.data.model,
            };
        });
    }
    /**
     * Google Gemini Chat Completion
     */
    chatGemini(apiKey, model, messages, temperature, maxTokens) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const geminiModel = model || 'gemini-2.0-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
            // Convert chat messages to Gemini format
            // Gemini uses system_instruction for system messages and contents[] for conversation
            const systemMessage = messages.find(m => m.role === 'system');
            const conversationMessages = messages.filter(m => m.role !== 'system');
            const contents = conversationMessages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            }));
            const body = {
                contents,
                generationConfig: {
                    temperature,
                    maxOutputTokens: maxTokens,
                },
            };
            if (systemMessage) {
                body.system_instruction = {
                    parts: [{ text: systemMessage.content }],
                };
            }
            const response = yield axios_1.default.post(url, body, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 120000,
            });
            const candidate = (_a = response.data.candidates) === null || _a === void 0 ? void 0 : _a[0];
            if (!candidate || !((_d = (_c = (_b = candidate.content) === null || _b === void 0 ? void 0 : _b.parts) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.text)) {
                throw new Error('No response from Gemini');
            }
            return {
                content: candidate.content.parts[0].text,
                tokensUsed: (_e = response.data.usageMetadata) === null || _e === void 0 ? void 0 : _e.totalTokenCount,
                model: geminiModel,
            };
        });
    }
    /**
     * Generate a simple text completion
     */
    generateText(prompt, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const messages = [];
            if (options === null || options === void 0 ? void 0 : options.systemPrompt) {
                messages.push({ role: 'system', content: options.systemPrompt });
            }
            messages.push({ role: 'user', content: prompt });
            const response = yield this.chat(messages, {
                temperature: options === null || options === void 0 ? void 0 : options.temperature,
                maxTokens: options === null || options === void 0 ? void 0 : options.maxTokens,
            });
            return response.content;
        });
    }
    /**
     * Generate structured JSON output from AI
     */
    generateJSON(prompt, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const systemPrompt = ((options === null || options === void 0 ? void 0 : options.systemPrompt) || '') +
                '\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.';
            const result = yield this.generateText(prompt, {
                systemPrompt,
                temperature: (_a = options === null || options === void 0 ? void 0 : options.temperature) !== null && _a !== void 0 ? _a : 0.3,
            });
            // Clean potential markdown code blocks
            const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            try {
                return JSON.parse(cleaned);
            }
            catch (parseError) {
                console.error('AI returned invalid JSON. Raw response:', result.substring(0, 500));
                throw new Error('AI returned an invalid response. Please try again.');
            }
        });
    }
}
// Export singleton instance
exports.aiService = new AIService();
exports.default = exports.aiService;
