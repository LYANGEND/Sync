import { getLencoConfig } from './settingsService';

export const initiateMobileMoneyCollection = async (
    amount: number,
    phoneNumber: string,
    reference: string,
    operator: 'mtn' | 'airtel'
) => {
    const isDebug = process.env.NODE_ENV === 'development';
    
    // Get Lenco config dynamically from database or environment
    const config = await getLencoConfig();
    
    if (!config.enabled || !config.apiToken) {
        throw new Error('Lenco payment gateway is not configured. Please configure it in Platform Settings.');
    }

    if (!config.apiUrl) {
        throw new Error('Lenco API URL is not configured');
    }

    // Sanitize phone number - remove spaces, dashes
    const sanitizedPhone = phoneNumber.replace(/[\s-]/g, '');

    const payload = {
        amount,
        phone: sanitizedPhone,
        reference,
        operator,
        country: 'zm',
        bearer: 'merchant'
    };

    if (isDebug) {
        console.log('DEBUG: Lenco API call initiated for reference:', reference);
        console.log('DEBUG: Using API URL:', config.apiUrl);
        console.log('DEBUG: Test mode:', config.testMode);
    }

    try {
        const response = await fetch(config.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (isDebug) {
            console.log('DEBUG: Lenco API Response Status:', response.status);
        }

        if (!response.ok) {
            console.error('Lenco API Error:', data.message || 'Unknown error');
            throw new Error(data.message || 'Failed to initiate mobile money payment');
        }

        return data;
    } catch (error) {
        console.error('DEBUG: Lenco API Exception:', error);
        throw error;
    }
};
