// Get user ID from localStorage or generate a new one
export const getUserId = () => {
    if (typeof window === 'undefined') return null;
    
    let stored = localStorage.getItem('userId');
    
    // If no stored ID or it's invalid, generate a new one
    if (!stored || stored === 'anonymous' || stored === 'null' || stored.trim() === '') {
        stored = `user_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
        localStorage.setItem('userId', stored);
        console.log("Generated new user ID:", stored);
    }
    
    return stored;
};

// Base API URL - use environment variable with fallback
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

// Helper function to add user ID to headers
export const getHeaders = (additionalHeaders = {}) => {
    const userId = getUserId();
    if (!userId) {
        console.error('No user ID available');
    }

    const headers = {
        'Content-Type': 'application/json',
        'X-User-Id': userId || 'anonymous',
        ...additionalHeaders
    };
    
    // Log headers for debugging
    console.log('Request Headers:', headers);
    return headers;
};

// API fetch wrapper that automatically includes user ID
export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                credentials: 'include',
                headers: {
                    ...options.headers,
                    'X-User-Id': getUserId() || '',
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return response;
        } catch (error) {
            retryCount++;
            if (retryCount === maxRetries) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
    }
}; 