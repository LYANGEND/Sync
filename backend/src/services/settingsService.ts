/**
 * Settings Service
 * 
 * Provides centralized access to platform settings with fallback to environment variables.
 * Settings are cached in memory for performance with a configurable TTL.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extended type to include new fields (until Prisma client is regenerated)
interface ExtendedPlatformSettings {
    id: string;
    // Existing fields
    smsProvider: string;
    smsApiUrl: string | null;
    smsApiKey: string | null;
    smsApiSecret: string | null;
    smsDefaultSenderId: string | null;
    smsBalanceUnits: number;
    smsCostPerUnit: any;
    emailProvider: string;
    emailApiKey: string | null;
    emailFromAddress: string | null;
    emailFromName: string | null;
    azureEmailEnabled: boolean;
    azureEmailConnectionString: string | null;
    azureEmailFromAddress: string | null;
    azureEmailEndpoint: string | null;
    azureEmailAccessKey: string | null;
    paymentGatewayProvider: string;
    mobileMoneyFeePercent: any;
    mobileMoneyFeeCap: any;
    mobileMoneyEnabled: boolean;
    allowedPaymentMethods: any;
    allowedOrigins: any;
    publicApiRateLimitPerMinute: number;
    paymentApiRateLimitPerMinute: number;
    platformName: string;
    platformLogoUrl: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
    allowTenantCustomSms: boolean;
    allowTenantCustomEmail: boolean;
    availableFeatures: any;
    availableTiers: any;
    createdAt: Date;
    updatedAt: Date;
    // New fields for API keys
    lencoApiKey?: string | null;
    lencoApiToken?: string | null;
    lencoWebhookSecret?: string | null;
    lencoApiUrl?: string | null;
    lencoTestMode?: boolean;
    azureOpenaiEnabled?: boolean;
    azureOpenaiApiKey?: string | null;
    azureOpenaiEndpoint?: string | null;
    azureOpenaiApiVersion?: string | null;
    azureOpenaiDeployment?: string | null;
}

// Cache settings in memory to avoid hitting DB on every request
let settingsCache: ExtendedPlatformSettings | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/**
 * Get platform settings from database with caching
 */
export async function getPlatformSettingsFromDB(): Promise<ExtendedPlatformSettings | null> {
    const now = Date.now();
    
    // Return cached settings if still valid
    if (settingsCache && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return settingsCache;
    }
    
    try {
        const settings = await prisma.platformSettings.findUnique({
            where: { id: 'default' },
        }) as ExtendedPlatformSettings | null;
        
        if (settings) {
            settingsCache = settings;
            cacheTimestamp = now;
        }
        
        return settings;
    } catch (error) {
        console.error('Failed to fetch platform settings:', error);
        return settingsCache; // Return stale cache if DB fails
    }
}

/**
 * Invalidate the settings cache (call after updates)
 */
export function invalidateSettingsCache(): void {
    settingsCache = null;
    cacheTimestamp = 0;
}

// ==========================================
// Azure OpenAI Settings
// ==========================================

export interface AzureOpenAIConfig {
    enabled: boolean;
    apiKey: string;
    endpoint: string;
    apiVersion: string;
    deployment: string;
}

/**
 * Get Azure OpenAI configuration
 * Priority: Database > Environment Variables
 */
export async function getAzureOpenAIConfig(): Promise<AzureOpenAIConfig> {
    const settings = await getPlatformSettingsFromDB();
    
    // Check if DB settings are configured and enabled
    if (settings?.azureOpenaiEnabled && settings.azureOpenaiApiKey && settings.azureOpenaiEndpoint) {
        return {
            enabled: true,
            apiKey: settings.azureOpenaiApiKey,
            endpoint: settings.azureOpenaiEndpoint,
            apiVersion: settings.azureOpenaiApiVersion || '2024-12-01-preview',
            deployment: settings.azureOpenaiDeployment || 'gpt-4o',
        };
    }
    
    // Fallback to environment variables
    const envApiKey = process.env.AZURE_OPENAI_API_KEY;
    const envEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    
    if (envApiKey && envEndpoint) {
        return {
            enabled: true,
            apiKey: envApiKey,
            endpoint: envEndpoint,
            apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
            deployment: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
        };
    }
    
    // Not configured
    return {
        enabled: false,
        apiKey: '',
        endpoint: '',
        apiVersion: '2024-12-01-preview',
        deployment: 'gpt-4o',
    };
}

// ==========================================
// Lenco Payment Gateway Settings
// ==========================================

export interface LencoConfig {
    enabled: boolean;
    apiKey: string;
    apiToken: string;
    webhookSecret: string;
    apiUrl: string;
    testMode: boolean;
}

/**
 * Get Lenco payment gateway configuration
 * Priority: Database > Environment Variables
 */
export async function getLencoConfig(): Promise<LencoConfig> {
    const settings = await getPlatformSettingsFromDB();
    
    // Check if DB settings are configured
    if (settings?.lencoApiToken || settings?.lencoApiKey) {
        return {
            enabled: settings.mobileMoneyEnabled ?? true,
            apiKey: settings.lencoApiKey || '',
            apiToken: settings.lencoApiToken || '',
            webhookSecret: settings.lencoWebhookSecret || '',
            apiUrl: settings.lencoTestMode 
                ? 'https://sandbox.lenco.co/access/V2/collections/mobile-money'
                : (settings.lencoApiUrl || 'https://api.lenco.co/access/v2/collections/mobile-money'),
            testMode: settings.lencoTestMode ?? false,
        };
    }
    
    // Fallback to environment variables
    const envToken = process.env.LENCO_API_TOKEN;
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
        enabled: !!envToken,
        apiKey: process.env.LENCO_API_KEY || '',
        apiToken: envToken || '',
        webhookSecret: process.env.LENCO_WEBHOOK_SECRET || '',
        apiUrl: isProduction 
            ? (process.env.LENCO_API_URL_PROD || 'https://api.lenco.co/access/v2/collections/mobile-money')
            : (process.env.LENCO_API_URL_TEST || 'https://sandbox.lenco.co/access/V2/collections/mobile-money'),
        testMode: !isProduction,
    };
}

// ==========================================
// Base Domains (for tenant resolution)
// ==========================================

/**
 * Get allowed base domains for tenant resolution
 * Priority: Database > Environment Variables
 */
export async function getBaseDomains(): Promise<string[]> {
    const settings = await getPlatformSettingsFromDB();
    
    // Check if DB settings have allowed origins configured
    if (settings?.allowedOrigins) {
        try {
            const origins = typeof settings.allowedOrigins === 'string' 
                ? JSON.parse(settings.allowedOrigins as string) 
                : settings.allowedOrigins;
            
            if (Array.isArray(origins) && origins.length > 0) {
                // Extract domains from origins
                return origins.map((origin: string) => {
                    try {
                        const url = new URL(origin);
                        return url.hostname;
                    } catch {
                        return origin;
                    }
                });
            }
        } catch (e) {
            console.error('Failed to parse allowedOrigins:', e);
        }
    }
    
    // Fallback to environment variable
    const envDomains = process.env.BASE_DOMAINS;
    if (envDomains) {
        return envDomains.split(',').map(d => d.trim());
    }
    
    // Default domains
    return ['localhost', 'bwangubwangu.net'];
}

// ==========================================
// CORS Origins
// ==========================================

/**
 * Get CORS allowed origins
 * Priority: Database > Environment Variables
 */
export async function getCorsOrigins(): Promise<string[]> {
    const settings = await getPlatformSettingsFromDB();
    
    if (settings?.allowedOrigins) {
        try {
            const origins = typeof settings.allowedOrigins === 'string' 
                ? JSON.parse(settings.allowedOrigins as string) 
                : settings.allowedOrigins;
            
            if (Array.isArray(origins)) {
                return origins;
            }
        } catch (e) {
            console.error('Failed to parse allowedOrigins:', e);
        }
    }
    
    // Fallback to environment variable
    const envOrigins = process.env.CORS_ORIGINS;
    if (envOrigins) {
        return envOrigins.split(',').map(o => o.trim());
    }
    
    // Default origins
    return ['http://localhost:5173', 'http://localhost:3000'];
}

// ==========================================
// Check if settings are configured
// ==========================================

export interface SettingsStatus {
    azureOpenAI: { configured: boolean; source: 'database' | 'environment' | 'none' };
    lenco: { configured: boolean; source: 'database' | 'environment' | 'none' };
    sms: { configured: boolean; source: 'database' | 'none' };
    email: { configured: boolean; source: 'database' | 'none' };
}

/**
 * Get the configuration status of all integrations
 */
export async function getSettingsStatus(): Promise<SettingsStatus> {
    const settings = await getPlatformSettingsFromDB();
    
    return {
        azureOpenAI: {
            configured: !!(settings?.azureOpenaiApiKey || process.env.AZURE_OPENAI_API_KEY),
            source: settings?.azureOpenaiApiKey 
                ? 'database' 
                : (process.env.AZURE_OPENAI_API_KEY ? 'environment' : 'none'),
        },
        lenco: {
            configured: !!(settings?.lencoApiToken || process.env.LENCO_API_TOKEN),
            source: settings?.lencoApiToken 
                ? 'database' 
                : (process.env.LENCO_API_TOKEN ? 'environment' : 'none'),
        },
        sms: {
            configured: !!settings?.smsApiKey,
            source: settings?.smsApiKey ? 'database' : 'none',
        },
        email: {
            configured: !!(settings?.emailApiKey || settings?.azureEmailConnectionString),
            source: (settings?.emailApiKey || settings?.azureEmailConnectionString) ? 'database' : 'none',
        },
    };
}
