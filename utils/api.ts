// Get user ID from localStorage or generate a new one
export const getUserId = () => {
    if (typeof window === 'undefined') return null;
    
    let stored = localStorage.getItem('userId');
    
    // If no stored ID or it's invalid, generate a new one
    if (!stored || stored === 'anonymous' || stored === 'null') {
        stored = `user_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
        localStorage.setItem('userId', stored);
    }
    
    return stored;
};

// Base API URL - use environment variable with fallback
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

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
    try {
        const url = `${API_BASE_URL}${endpoint}`;
        const method = options.method || 'GET';
        
        console.log(`Making ${method} request to: ${url}`);
        
        // Ensure proper headers for POST requests with JSON body
        const headers = getHeaders(options.headers);
        if (method === 'POST' && options.body && typeof options.body === 'string') {
            try {
                // Verify it's valid JSON
                JSON.parse(options.body);
            } catch (e) {
                console.error('Invalid JSON body:', e);
                throw new Error('Invalid JSON body');
            }
        }
        
        // Add timeout to the fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include', // This is important for CORS
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Log response details for debugging
        console.log(`Response status: ${response.status}`);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return response;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error('Request timed out');
            throw new Error('Request timed out after 10 seconds');
        }
        if (error.message === 'Failed to fetch') {
            console.error('Network error - please check if the backend server is running');
            throw new Error('Unable to connect to the server. Please ensure the backend is running.');
        }
        console.error('API request failed:', error);
        throw error;
    }
}; 