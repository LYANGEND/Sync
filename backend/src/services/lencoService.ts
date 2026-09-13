/**
 * Lenco API Service
 * Handles mobile money collections via Lenco payment gateway
 * API Documentation: https://lenco-api.readme.io/v2.0/reference
 */

import { prisma } from '../utils/prisma';
import crypto from 'crypto';
import { getPlatformLencoSettings } from './platformLencoSettingsService';
// Lenco API Configuration
interface LencoConfig {
    apiKey: string;
    baseUrl: string;
    environment: 'sandbox' | 'production';
    initiate: string;
    status: string;
    details: string;
}

// Mobile Money Collection Request
interface MobileMoneyCollectionRequest {
    amount: number;
    phone: string;
    country: 'zm' | 'mw'; // Zambia or Malawi
    operator: 'airtel' | 'mtn' | 'tnm'; // Mobile operators
    reference: string;
    bearer?: 'merchant' | 'customer'; // Who pays the fee
}

// Lenco API Response
interface LencoCollectionResponse {
    status: boolean;
    message: string;
    data: {
        id: string;
        initiatedAt: string;
        completedAt: string | null;
        amount: string;
        fee: string | null;
        bearer: 'merchant' | 'customer';
        currency: string;
        reference: string;
        lencoReference: string;
        type: 'mobile-money';
        status: 'pending' | 'successful' | 'failed' | 'pay-offline';
        source: 'api';
        reasonForFailure: string | null;
        settlementStatus: 'pending' | 'settled' | null;
        settlement: null;
        mobileMoneyDetails: {
            country: string;
            phone: string;
            operator: string;
            accountName: string | null;
            operatorTransactionId: string | null;
        } | null;
        bankAccountDetails: null;
        cardDetails: null;
    };
}

interface LencoErrorResponse {
    status: boolean;
    message: string;
    errors?: Array<{ field: string; message: string }>;
}

// Get Lenco configuration from the tenant's own school settings.
// Tenant fee-collection (from parents/students) always uses the tenant's own
// merchant account — it never falls back to the platform's Lenco account.
// The platform's own account (PlatformLencoSettings) is reserved exclusively
// for collecting a tenant's platform subscription/invoice payments — see
// getPlatformOnlyLencoConfig() below.
async function getLencoConfig(): Promise<LencoConfig | null> {
    try {
        const settings = await prisma.schoolSettings.findFirst({
            select: {
                lencoApiKey: true,
                lencoEnvironment: true,
            },
        });

        const apiKey = settings?.lencoApiKey;
        const environment = (settings?.lencoEnvironment as 'sandbox' | 'production') || 'sandbox';

        if (!apiKey) {
            console.log('Lenco API key not configured');
            return null;
        }

        return {
            apiKey,
            ...lencoEndpointsFor(environment),
            environment,
        };
    } catch (error) {
        console.error('Failed to get Lenco config:', error);
        return null;
    }
}

// Get the platform's own Lenco configuration (PlatformLencoSettings), used
// exclusively for collecting a tenant's platform subscription/invoice payments.
export async function getPlatformOnlyLencoConfig(): Promise<LencoConfig | null> {
    try {
        const platform = await getPlatformLencoSettings();
        if (!platform.enabled || !platform.apiKey) {
            console.log('Platform Lenco account not configured');
            return null;
        }
        const environment = (platform.environment as 'sandbox' | 'production') || 'sandbox';
        return {
            apiKey: platform.apiKey,
            ...lencoEndpointsFor(environment),
            environment,
        };
    } catch (error) {
        console.error('Failed to get platform Lenco config:', error);
        return null;
    }
}

function lencoEndpointsFor(environment: 'sandbox' | 'production') {
    return environment === 'production'
        ? {
            baseUrl: 'https://api.lenco.co/access/v2',
            initiate: 'https://api.lenco.co/access/v2/collections/mobile-money',
            status: 'https://api.lenco.co/access/v2/collections/status',
            details: 'https://api.lenco.co/access/v2/collections'
        }
        : {
            baseUrl: 'https://sandbox.lenco.co/access/v2',
            initiate: 'https://sandbox.lenco.co/access/v2/collections/mobile-money',
            status: 'https://sandbox.lenco.co/access/v2/collections/status',
            details: 'https://sandbox.lenco.co/access/v2/collections'
        };
}

/**
 * Initiate a mobile money collection request against a resolved Lenco config.
 * Shared by both the tenant fee-collection flow and the platform subscription flow.
 */
async function postCollection(
    config: LencoConfig,
    request: MobileMoneyCollectionRequest
): Promise<{ success: boolean; data?: LencoCollectionResponse['data']; error?: string }> {
    // Validate operator by country
    if (request.country === 'zm' && !['airtel', 'mtn'].includes(request.operator)) {
        return { success: false, error: 'Invalid operator for Zambia. Use "airtel" or "mtn".' };
    }
    if (request.country === 'mw' && !['airtel', 'tnm'].includes(request.operator)) {
        return { success: false, error: 'Invalid operator for Malawi. Use "airtel" or "tnm".' };
    }

    console.log('Initiating Lenco collection', {
        environment: config.environment,
        reference: request.reference,
        country: request.country,
        operator: request.operator,
    });

    const response = await fetch(config.initiate, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            amount: request.amount,
            phone: request.phone,
            country: request.country,
            operator: request.operator,
            reference: request.reference,
            bearer: request.bearer || 'merchant',
        }),
    });

    const result = await response.json() as LencoCollectionResponse | LencoErrorResponse;

    if (!response.ok || !result.status) {
        const errorResponse = result as LencoErrorResponse;
        console.error('Lenco API error:', errorResponse);
        return {
            success: false,
            error: errorResponse.message || 'Failed to initiate mobile money collection'
        };
    }

    const successResponse = result as LencoCollectionResponse;
    console.log('Mobile money collection initiated:', successResponse.data.reference);
    return { success: true, data: successResponse.data };
}



/**
 * Initiate a mobile money collection request against a tenant's own Lenco account.
 * The customer will receive a prompt on their phone to authorize the payment.
 */
export async function initiateMobileMoneyCollection(
    request: MobileMoneyCollectionRequest
): Promise<{ success: boolean; data?: LencoCollectionResponse['data']; error?: string }> {
    try {
        const config = await getLencoConfig();
        if (!config) {
            return { success: false, error: 'Lenco API not configured. Please configure your API key in settings.' };
        }
        return await postCollection(config, request);
    } catch (error) {
        console.error('Lenco mobile money collection error:', error);
        return { success: false, error: 'Failed to connect to Lenco API' };
    }
}

/**
 * Initiate a mobile money collection request against the platform's own Lenco
 * account, used exclusively to collect a tenant's platform subscription/invoice
 * payment. The customer (the tenant's billing contact) will receive a prompt on
 * their phone to authorize the payment.
 */
export async function initiatePlatformSubscriptionCollection(
    request: MobileMoneyCollectionRequest
): Promise<{ success: boolean; data?: LencoCollectionResponse['data']; error?: string }> {
    try {
        const config = await getPlatformOnlyLencoConfig();
        if (!config) {
            return { success: false, error: 'Platform Lenco account is not configured. Please contact support.' };
        }
        return await postCollection(config, request);
    } catch (error) {
        console.error('Lenco platform subscription collection error:', error);
        return { success: false, error: 'Failed to connect to Lenco API' };
    }
}

/**
 * Get collection status by reference, against a resolved Lenco config.
 */
async function fetchCollectionStatus(
    config: LencoConfig,
    reference: string
): Promise<{ success: boolean; data?: LencoCollectionResponse['data']; error?: string }> {
    const response = await fetch(
        `${config.status}/${encodeURIComponent(reference)}`,
        {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
            },
        }
    );

    const result = await response.json() as LencoCollectionResponse | LencoErrorResponse;

    if (!response.ok || !result.status) {
        const errorResponse = result as LencoErrorResponse;
        return { success: false, error: errorResponse.message };
    }

    const successResponse = result as LencoCollectionResponse;
    return { success: true, data: successResponse.data };
}

/**
 * Get collection status by reference (tenant's own Lenco account).
 */
export async function getCollectionStatus(
    reference: string
): Promise<{ success: boolean; data?: LencoCollectionResponse['data']; error?: string }> {
    try {
        const config = await getLencoConfig();
        if (!config) {
            return { success: false, error: 'Lenco API not configured' };
        }
        return await fetchCollectionStatus(config, reference);
    } catch (error) {
        console.error('Lenco get collection status error:', error);
        return { success: false, error: 'Failed to get collection status' };
    }
}

/**
 * Get platform subscription collection status by reference (platform's own Lenco account).
 */
export async function getPlatformCollectionStatus(
    reference: string
): Promise<{ success: boolean; data?: LencoCollectionResponse['data']; error?: string }> {
    try {
        const config = await getPlatformOnlyLencoConfig();
        if (!config) {
            return { success: false, error: 'Platform Lenco account is not configured' };
        }
        return await fetchCollectionStatus(config, reference);
    } catch (error) {
        console.error('Lenco get platform collection status error:', error);
        return { success: false, error: 'Failed to get collection status' };
    }
}

/**
 * Get collection by ID
 */
export async function getCollectionById(
    collectionId: string
): Promise<{ success: boolean; data?: LencoCollectionResponse['data']; error?: string }> {
    try {
        const config = await getLencoConfig();
        if (!config) {
            return { success: false, error: 'Lenco API not configured' };
        }

        const response = await fetch(
            `${config.details}/${encodeURIComponent(collectionId)}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                },
            }
        );

        const result = await response.json() as LencoCollectionResponse | LencoErrorResponse;

        if (!response.ok || !result.status) {
            const errorResponse = result as LencoErrorResponse;
            return { success: false, error: errorResponse.message };
        }

        const successResponse = result as LencoCollectionResponse;
        return { success: true, data: successResponse.data };
    } catch (error) {
        console.error('Lenco get collection by ID error:', error);
        return { success: false, error: 'Failed to get collection details' };
    }
}

/**
 * Verify the provider's HMAC SHA-256 webhook signature.
 * The raw request body is used so serialization differences cannot invalidate signatures.
 */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
    const secret = process.env.LENCO_WEBHOOK_SECRET;
    if (!secret || !signature) return false;

    const supplied = signature.replace(/^sha256=/i, '').trim().toLowerCase();
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (supplied.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'));
}

// Export types for use in controllers
export type {
    MobileMoneyCollectionRequest,
    LencoCollectionResponse,
    LencoConfig
};


export default {
    initiateMobileMoneyCollection,
    initiatePlatformSubscriptionCollection,
    getCollectionStatus,
    getPlatformCollectionStatus,
    getCollectionById,
    verifyWebhookSignature,
};
