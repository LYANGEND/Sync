"use strict";
/**
 * Lenco API Service
 * Handles mobile money collections via Lenco payment gateway
 * API Documentation: https://lenco-api.readme.io/v2.0/reference
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initiateMobileMoneyCollection = initiateMobileMoneyCollection;
exports.getCollectionStatus = getCollectionStatus;
exports.getCollectionById = getCollectionById;
exports.verifyWebhookSignature = verifyWebhookSignature;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// Get Lenco configuration from school settings
function getLencoConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const settings = yield prisma.schoolSettings.findFirst({
                select: {
                    lencoApiKey: true,
                    lencoEnvironment: true,
                },
            });
            if (!(settings === null || settings === void 0 ? void 0 : settings.lencoApiKey)) {
                console.log('Lenco API key not configured');
                return null;
            }
            const environment = settings.lencoEnvironment || 'sandbox';
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
            return Object.assign(Object.assign({ apiKey: settings.lencoApiKey }, endpoints), { environment });
        }
        catch (error) {
            console.error('Failed to get Lenco config:', error);
            return null;
        }
    });
}
/**
 * Initiate a mobile money collection request
 * The customer will receive a prompt on their phone to authorize the payment
 */
function initiateMobileMoneyCollection(request) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const config = yield getLencoConfig();
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
            const response = yield fetch(config.initiate, {
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
            const result = yield response.json();
            console.log('Full Response Body:', JSON.stringify(result, null, 2));
            if (!response.ok || !result.status) {
                const errorResponse = result;
                console.error('Lenco API error:', errorResponse);
                return {
                    success: false,
                    error: errorResponse.message || 'Failed to initiate mobile money collection'
                };
            }
            const successResponse = result;
            console.log('Mobile money collection initiated:', successResponse.data.reference);
            return { success: true, data: successResponse.data };
        }
        catch (error) {
            console.error('Lenco mobile money collection error:', error);
            return { success: false, error: 'Failed to connect to Lenco API' };
        }
    });
}
/**
 * Get collection status by reference
 */
function getCollectionStatus(reference) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const config = yield getLencoConfig();
            if (!config) {
                return { success: false, error: 'Lenco API not configured' };
            }
            const response = yield fetch(`${config.status}/${encodeURIComponent(reference)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                },
            });
            const result = yield response.json();
            if (!response.ok || !result.status) {
                const errorResponse = result;
                return { success: false, error: errorResponse.message };
            }
            const successResponse = result;
            return { success: true, data: successResponse.data };
        }
        catch (error) {
            console.error('Lenco get collection status error:', error);
            return { success: false, error: 'Failed to get collection status' };
        }
    });
}
/**
 * Get collection by ID
 */
function getCollectionById(collectionId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const config = yield getLencoConfig();
            if (!config) {
                return { success: false, error: 'Lenco API not configured' };
            }
            const response = yield fetch(`${config.details}/${encodeURIComponent(collectionId)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                },
            });
            const result = yield response.json();
            if (!response.ok || !result.status) {
                const errorResponse = result;
                return { success: false, error: errorResponse.message };
            }
            const successResponse = result;
            return { success: true, data: successResponse.data };
        }
        catch (error) {
            console.error('Lenco get collection by ID error:', error);
            return { success: false, error: 'Failed to get collection details' };
        }
    });
}
/**
 * Verify webhook signature (for production use)
 * TODO: Implement signature verification when Lenco provides documentation
 */
function verifyWebhookSignature(payload, signature) {
    // Placeholder - implement when Lenco provides webhook signature verification
    console.log('Webhook signature verification not yet implemented');
    return true;
}
exports.default = {
    initiateMobileMoneyCollection,
    getCollectionStatus,
    getCollectionById,
    verifyWebhookSignature,
};
