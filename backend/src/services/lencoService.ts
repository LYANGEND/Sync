export const initiateMobileMoneyCollection = async (
    amount: number,
    phoneNumber: string,
    reference: string,
    operator: 'mtn' | 'airtel'
) => {
    const isDebug = process.env.NODE_ENV === 'development';
    
    const url = process.env.NODE_ENV === 'production' 
        ? process.env.LENCO_API_URL_PROD 
        : process.env.LENCO_API_URL_TEST;
    const apiKey = process.env.LENCO_API_TOKEN;

    if (!apiKey) {
        throw new Error('LENCO_API_TOKEN is not configured');
    }

    if (!url) {
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
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
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
