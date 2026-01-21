/**
 * Lenco API Service
 * Handles mobile money collections via Lenco payment gateway
 * API Documentation: https://lenco-api.readme.io/v2.0/reference
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

// Get Lenco configuration from school settings
async function getLencoConfig(): Promise<LencoConfig | null> {
    try {
        const settings = await prisma.schoolSettings.findFirst({
            select: {
                lencoApiKey: true,
                lencoEnvironment: true,
            },
        });

        if (!settings?.lencoApiKey) {
            console.log('Lenco API key not configured');
            return null;
        }

        const environment = (settings.lencoEnvironment as 'sandbox' | 'production') || 'sandbox';

        // Define endpoints based on environment (User provided paths)
        const endpoints = environment === 'production'
            ? {
                baseUrl: 'https://api.lenco.co/access/v2',
                initiate: 'https://api.lenco.co/access/v2/collections/mobile-money',
                // Assuming status/details follow standard REST structure under the base
                status: 'https://api.lenco.co/access/v2/collections/status',
                details: 'https://api.lenco.co/access/v2/collections'
            }
            : {
                baseUrl: 'https://sandbox.lenco.co/access/v2',
                // Updated to standard structure based on docs
                initiate: 'https://sandbox.lenco.co/access/v2/collections/mobile-money',
                status: 'https://sandbox.lenco.co/access/v2/collections/status',
                details: 'https://sandbox.lenco.co/access/v2/collections'
            };

        return {
            apiKey: settings.lencoApiKey,
            ...endpoints,
            environment,
        };
    } catch (error) {
        console.error('Failed to get Lenco config:', error);
        return null;
    }
}

/**
 * Initiate a mobile money collection request
 * The customer will receive a prompt on their phone to authorize the payment
 */
export async function initiateMobileMoneyCollection(
    request: MobileMoneyCollectionRequest
): Promise<{ success: boolean; data?: LencoCollectionResponse['data']; error?: string }> {
    try {
        const config = await getLencoConfig();
        if (!config) {
            return { success: false, error: 'Lenco API not configured. Please configure your API key in settings.' };
        }

        // Validate operator by country
        if (request.country === 'zm' && !['airtel', 'mtn'].includes(request.operator)) {
            return { success: false, error: 'Invalid operator for Zambia. Use "airtel" or "mtn".' };
        }
        if (request.country === 'mw' && !['airtel', 'tnm'].includes(request.operator)) {
            return { success: false, error: 'Invalid operator for Malawi. Use "airtel" or "tnm".' };
        }

        // DEBUGGING LOGS
        console.log('--- Lenco Initiation Debug ---');
        console.log('URL:', config.initiate);
        console.log('Environment:', config.environment);
        console.log('API Key (Masked):', config.apiKey ? `${config.apiKey.substring(0, 4)}...${config.apiKey.substring(config.apiKey.length - 4)}` : 'MISSING');
        console.log('Payload:', JSON.stringify({
            amount: request.amount,
            phone: request.phone,
            country: request.country,
            operator: request.operator,
            reference: request.reference,
            bearer: request.bearer || 'merchant',
        }, null, 2));

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

        console.log('Response Status:', response.status);
        console.log('Response Headers:', JSON.stringify([...response.headers.entries()]));

        const result = await response.json() as LencoCollectionResponse | LencoErrorResponse;
        console.log('Full Response Body:', JSON.stringify(result, null, 2));

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
    } catch (error) {
        console.error('Lenco mobile money collection error:', error);
        return { success: false, error: 'Failed to connect to Lenco API' };
    }
}

/**
 * Get collection status by reference
 */
export async function getCollectionStatus(
    reference: string
): Promise<{ success: boolean; data?: LencoCollectionResponse['data']; error?: string }> {
    try {
        const config = await getLencoConfig();
        if (!config) {
            return { success: false, error: 'Lenco API not configured' };
        }

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
    } catch (error) {
        console.error('Lenco get collection status error:', error);
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
 * Verify webhook signature (for production use)
 * TODO: Implement signature verification when Lenco provides documentation
 */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
    // Placeholder - implement when Lenco provides webhook signature verification
    console.log('Webhook signature verification not yet implemented');
    return true;
}

// Export types for use in controllers
export type {
    MobileMoneyCollectionRequest,
    LencoCollectionResponse,
    LencoConfig
};

export default {
    initiateMobileMoneyCollection,
    getCollectionStatus,
    getCollectionById,
    verifyWebhookSignature,
};
