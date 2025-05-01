"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertCircle, Play, Loader2, Square } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import ConfigEditor from "@/components/config-editor"
import JobsList from "@/components/jobs-list"
import axios from "axios"
import { getUserId, getHeaders } from "@/utils/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Manager, Socket } from "socket.io-client"
import { connect as io } from "socket.io-client"



interface ExtendedSocket {
  connected: boolean;
  disconnect: () => void;
  emit: (event: string, ...args: any[]) => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
  onAny: (listener: (eventName: string, ...args: any[]) => void) => void;
}

interface ScraperResponse {
  status: string;
  message: string;
  job_id?: string;
}

interface WebSocketMessage {
  type: string;
  status?: string;
  message?: string;
  job_id: string;
  user_id?: string;
  timestamp?: string;
}

interface LogEntry {
  id: number;
  text: string;
  timestamp?: string;
}

interface JobLogs {
  [jobId: string]: LogEntry[];
}

interface LoadingJobs {
  [key: string]: boolean;
}

interface RunningJobs {
  [key: string]: boolean;
}

interface StoppingJobs {
  [key: string]: boolean;
}

interface ForceRefresh {
  [key: string]: number;
}

// Enhanced Socket.IO Debugging Component
const SocketDebug = ({ isConnected, userId, socket }: { isConnected: boolean, userId: string | null, socket: any }) => {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [lastActivity, setLastActivity] = useState<string>("None");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Update status when connection state changes
  useEffect(() => {
    if (isConnected) {
      setLastActivity(`Connected at ${new Date().toLocaleTimeString()}`);
      setConnectionError(null);
    } else {
      setConnectionError("Disconnected - Check if backend is running");
    }
  }, [isConnected]);
  
  return (
    <div className={`fixed bottom-0 right-0 bg-black bg-opacity-75 text-white p-2 text-xs z-50 rounded-tl-md ${expanded ? 'w-80' : 'w-auto'}`}>
      <div className="flex justify-between items-center mb-1">
        <span>Socket: <span className={isConnected ? 'text-green-500' : 'text-red-500'}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span></span>
        <button 
          onClick={() => setExpanded(!expanded)} 
          className="px-2 py-0.5 rounded hover:bg-gray-700"
        >
          {expanded ? 'Hide' : 'More'}
        </button>
      </div>
      
      <div className="flex">
        <span>User ID: {userId?.slice(0, 8)}...</span>
        <button 
          onClick={() => {
            // Manually trigger reconnection
            if (socket?.current) {
              socket.current.disconnect();
              setTimeout(() => window.location.reload(), 500);
            } else {
              window.location.reload();
            }
          }}
          className="ml-2 px-1.5 py-0.5 rounded bg-blue-700 hover:bg-blue-600 text-xs"
        >
          Reconnect
        </button>
      </div>
      
      {expanded && (
        <div className="mt-2 border-t border-gray-700 pt-1">
          <div>Last Activity: {lastActivity}</div>
          {connectionError && (
            <div className="mt-1 text-red-400">Error: {connectionError}</div>
          )}
          <div className="mt-1 text-yellow-400">
            Backend URL: {process.env.NEXT_PUBLIC_API_URL}
          </div>
          <div className="mt-1">
            <button 
              onClick={() => {
                // Use proper headers with X-User-Id
                const headers = getHeaders();
                fetch(`${process.env.NEXT_PUBLIC_API_URL}/ping`, {
                  headers
                })
                  .then(res => res.json())
                  .then(data => {
                    setLastActivity(`Server pinged at ${new Date().toLocaleTimeString()}`);
                    setConnectionError(null);
                  })
                  .catch(err => {
                    setConnectionError(`Ping failed: ${err.message}`);
                  });
              }}
              className="px-2 py-0.5 rounded bg-green-700 hover:bg-green-600 text-xs"
            >
              Ping Server
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function WebScraperPage() {
  const [activeTab, setActiveTab] = useState<string>("config")
  const [jobLogs, setJobLogs] = useState<JobLogs>({})
  const [logCounter, setLogCounter] = useState<number>(0)
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [loadingJobs, setLoadingJobs] = useState<LoadingJobs>({})
  const [runningJobs, setRunningJobs] = useState<RunningJobs>({})
  const [stoppingJobs, setStoppingJobs] = useState<StoppingJobs>({})
  const [forceRefresh, setForceRefresh] = useState<ForceRefresh>({})
  const scraperRunning = useRef<boolean>(false)
  const socket = useRef<ExtendedSocket | null>(null)
  const endOfLogsRef = useRef<HTMLDivElement>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState<boolean>(true)

  // Add a seen message cache to prevent duplicate logs
  const [seenMessages] = useState<Set<string>>(new Set<string>());
  // Add a set to specifically track seen WebSocket messages
  const [seenWebSocketMessages] = useState<Map<string, number>>(new Map<string, number>());

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    endOfLogsRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeJobId, jobLogs, forceRefresh])

  // Debug log changes
  useEffect(() => {
    if (activeJobId && jobLogs[activeJobId]) {
      console.log(`[DEBUG] Job logs for ${activeJobId}: ${jobLogs[activeJobId].length} entries`);
    }
  }, [jobLogs, activeJobId])

  // Connect Socket.IO when component mounts
  useEffect(() => {
    // Try to get user ID first
    const initialUserId = getUserId();
    console.log("Initial userId for Socket.IO:", initialUserId);
    
    // Connect with user ID if available (handle null case)
    const initConnection = async () => {
      if (initialUserId) {
        setUserId(initialUserId);
        await connectSocketIO(initialUserId);
      } else {
        await connectSocketIO();
      }
    };
    
    initConnection();
    
    return () => {
      if (socket.current) {
        try {
          socket.current.disconnect();
        } catch (e) {
          console.error("Error disconnecting Socket.IO on cleanup:", e);
        }
        socket.current = null;
      }
    }
  }, []) // Only on mount/unmount

  const handleSocketMessage = (jsonMessage: WebSocketMessage) => {
    const { job_id: jobId, user_id: messageUserId, message: messageContent, type, status, timestamp } = jsonMessage;
    
    console.log("Processing Socket.IO message:", {
      type,
      jobId,
      messageUserId,
      messageContent: messageContent ? (messageContent.length > 50 ? `${messageContent.substring(0, 50)}...` : messageContent) : null,
      status,
      timestamp,
      currentUserId: userId,
      activeJobId
    });
    
    // Normalize message content for better deduplication
    const normalizedContent = messageContent?.trim() || "";
    
    // Create a more specific fingerprint for this message for deduplication
    // Include type, jobId, and the normalized content
    const messageFingerprint = `${type}:${jobId || "system"}:${normalizedContent}`;
    
    // Track message occurrences to detect duplicates
    const messageCount = seenWebSocketMessages.get(messageFingerprint) || 0;
    
    // Skip if we've seen this exact message more than once
    if (messageCount > 0) {
      console.log(`Skipping duplicate Socket.IO message (count: ${messageCount + 1}):`, messageFingerprint);
      seenWebSocketMessages.set(messageFingerprint, messageCount + 1);
      return;
    }
    
    // Track this message
    seenWebSocketMessages.set(messageFingerprint, messageCount + 1);
    
    // Clean up seenWebSocketMessages map periodically
    if (seenWebSocketMessages.size > 1000) {
      // Keep only the most recent 500 messages
      const entries = Array.from(seenWebSocketMessages.entries());
      seenWebSocketMessages.clear();
      entries.slice(-500).forEach(([key, value]) => {
        seenWebSocketMessages.set(key, value);
      });
    }
    
    // More lenient user ID check
    if (messageUserId && userId) {
      // Compare user IDs, but handle potential prefix/suffix differences
      const messageUserIdBase = messageUserId.split('_')[1]; // Extract base ID if format is user_XXXX_timestamp
      const currentUserIdBase = userId.split('_')[1];
      
      if (messageUserIdBase && currentUserIdBase && messageUserIdBase !== currentUserIdBase) {
        console.log(`User ID mismatch: message=${messageUserId} (${messageUserIdBase}) vs current=${userId} (${currentUserIdBase})`);
        return;
      }
    }
    
    if (!jobId) {
      console.warn("Message missing job ID, using system or active job ID:", jsonMessage);
      // This should no longer happen with our backend changes, but just in case
      jsonMessage.job_id = activeJobId || "system";
    }

    // Handle system messages specially
    const useJobId = jsonMessage.job_id;
    const isSystemMessage = useJobId === "system";
    
    // Initialize logs array for this job if it doesn't exist
    setJobLogs((prevLogs: JobLogs) => {
      if (!prevLogs[useJobId]) {
        console.log("Initializing logs for job:", useJobId);
        return {
          ...prevLogs,
          [useJobId]: []
        };
      }
      return prevLogs;
    });

    // Set as active job if no other job is active (or for important system messages)
    if (!activeJobId || (isSystemMessage && !runningJobs[activeJobId])) {
      console.log("Setting active job ID:", useJobId);
      setActiveJobId(useJobId);
    }

    // Format the log message with timestamp if available
    let formattedMessage = timestamp 
      ? `[${new Date(timestamp).toLocaleTimeString()}] ${messageContent || ""}`
      : messageContent || "";
    
    // Ensure there's content to log
    if (!formattedMessage.trim() && !status) {
      console.log("Empty message, not logging");
      return;
    }

    // Normalize all types of newlines to standard \n
    formattedMessage = formattedMessage
      .replace(/\\n/g, '\n')
      .replace(/\\r\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    // Double-check for escaped newlines that might have been double-escaped
    if (formattedMessage.includes('\\n') || formattedMessage.includes('\\r')) {
      try {
        // Try to decode potential JSON escape sequences
        formattedMessage = JSON.parse(`"${formattedMessage.replace(/"/g, '\\"')}"`);
      } catch (error) {
        console.warn("Error decoding newlines in message:", error);
        // Fall back to manual replacement
        formattedMessage = formattedMessage.replace(/\\r\\n|\\n|\\r/g, '\n');
      }
    }

    // Normalize Unicode characters
    try {
      formattedMessage = decodeURIComponent(escape(formattedMessage));
    } catch (error) {
      console.warn("Error normalizing Unicode characters:", error);
    }

    // Check if this message indicates the job has ended
    const isCompletionMessage = messageContent?.includes("Scraper completed successfully") || 
                              messageContent?.includes("Successfully quit driver") ||
                              messageContent?.includes("Cleaning up driver after successful scraping");
                              
    if (isCompletionMessage) {
        console.log(`Job completion detected for job ${useJobId}`);
        setRunningJobs(prev => ({ ...prev, [useJobId]: false }));
        setLoadingJobs(prev => ({ ...prev, [useJobId]: false }));
        setStoppingJobs(prev => ({ ...prev, [useJobId]: false }));
        
        // Add completion message to logs
        handleLogMessage(useJobId, "✅ Scraper completed successfully and driver cleaned up");
    }
    
    // Handle different message types
    switch (type) {
      case "state":
        console.log(`State update for job ${useJobId}:`, status);
        handleStateUpdate(useJobId, status);
        // Always log state changes
        handleLogMessage(useJobId, formattedMessage || `State changed to: ${status}`);
        break;
        
      case "log":
        // Check for error messages that might indicate driver issues
        const isDriverError = messageContent?.toLowerCase().includes("error") && 
                            (messageContent?.toLowerCase().includes("driver") || 
                             messageContent?.toLowerCase().includes("chrome"));
                             
        if (isDriverError) {
            console.log(`Driver error detected for job ${useJobId}`);
            // Don't reset button states for ChromeDriver errors
            if (!messageContent?.toLowerCase().includes("chromedriver")) {
                setRunningJobs(prev => ({ ...prev, [useJobId]: false }));
                setLoadingJobs(prev => ({ ...prev, [useJobId]: false }));
                setStoppingJobs(prev => ({ ...prev, [useJobId]: false }));
            }
        }
        
        // Process log message as before
        handleLogMessage(useJobId, formattedMessage);
        break;
        
      case "connection":
        console.log("Socket.IO connection established");
        // Add to seen messages with a distinct connection pattern for this job
        const connectionKey = `connection:${useJobId}`;
        seenWebSocketMessages.set(connectionKey, 1);
        
        // Initialize system logs container if needed without adding duplicate messages
        if (!jobLogs["system"]) {
          setJobLogs((prevLogs: JobLogs) => ({
            ...prevLogs,
            "system": []
          }));
        }
        
        // Add connection message for system without duplicating it
        handleLogMessage(useJobId, formattedMessage || "Socket.IO connection established");
        break;
        
      default:
        // Handle any message with content as a log
        console.log(`Adding default message for job ${useJobId}:`, formattedMessage);
        handleLogMessage(useJobId, formattedMessage || `Received message of type: ${type}`);
    }
    
    // Auto-scroll to bottom after processing message
    setTimeout(() => {
      endOfLogsRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 10);
  };

  const handleStateUpdate = (jobId: string, status?: string) => {
    if (!status) return;

    if (status === "running") {
      setRunningJobs((prev: RunningJobs) => ({ ...prev, [jobId]: true }));
      setLoadingJobs((prev: LoadingJobs) => ({ ...prev, [jobId]: false }));
      setStoppingJobs((prev: StoppingJobs) => ({ ...prev, [jobId]: false }));
      
      // Add a log entry for job start
      handleLogMessage(jobId, "Scraper started running...");
    } else if (status === "stopping") {
      setRunningJobs((prev: RunningJobs) => ({ ...prev, [jobId]: false }));
      setLoadingJobs((prev: LoadingJobs) => ({ ...prev, [jobId]: false }));
      setStoppingJobs((prev: StoppingJobs) => ({ ...prev, [jobId]: true }));
      
      // Add a log entry for job stopping
      handleLogMessage(jobId, "Stopping scraper...");
    } else if (status === "stopped" || status === "error" || status === "completed") {
      // Reset all states for the job
      setRunningJobs((prev: RunningJobs) => ({ ...prev, [jobId]: false }));
      setLoadingJobs((prev: LoadingJobs) => ({ ...prev, [jobId]: false }));
      setStoppingJobs((prev: StoppingJobs) => ({ ...prev, [jobId]: false }));
      
      // Add a log entry for job end
      const message = status === "error" 
        ? "Scraper stopped with error"
        : status === "completed"
        ? "Scraper completed successfully"
        : "Scraper stopped by user";
      handleLogMessage(jobId, message);
    }
  };

  // Update isJobEndMessage function to be more comprehensive
  const isJobEndMessage = (message: string): boolean => {
    const endPatterns = [
        "Scraper completed successfully",
        "Successfully quit driver",
        "Cleaning up driver after successful scraping",
        "Scraper job ended",
        "Error during driver cleanup"
    ];
    
    return endPatterns.some(pattern => message.includes(pattern));
  };

  // Check if two messages are similar enough to be considered duplicates
  const areSimilarMessages = (msg1: string, msg2: string): boolean => {
    // If they're identical after normalization, they're duplicates
    if (msg1 === msg2) return true;
    
    // If one is a substring of the other, they're likely duplicates
    if (msg1.includes(msg2) || msg2.includes(msg1)) return true;
    
    // If they're both about WebSocket connections, check similarity more carefully
    if (msg1.toLowerCase().includes('websocket') && msg2.toLowerCase().includes('websocket')) {
      // Extract the key parts without variable data
      const normalize = (msg: string) => msg.toLowerCase()
        .replace(/from\s+\S+/gi, 'from [client]')
        .replace(/user\s+\S+/gi, 'user [id]')
        .replace(/client\s+\S+/gi, 'client [id]')
        .replace(/\[\d{2}:\d{2}:\d{2}[^\]]*\]/g, '[time]')
        .replace(/\d{4}-\d{2}-\d{2}/g, '[date]');
      
      const norm1 = normalize(msg1);
      const norm2 = normalize(msg2);
      
      return norm1 === norm2 || norm1.includes(norm2) || norm2.includes(norm1);
    }
    
    return false;
  };

  const handleLogMessage = (jobId: string, message: string) => {
    setJobLogs((prevLogs: JobLogs) => {
      const updatedLogs = { ...prevLogs };
      const jobLogs = updatedLogs[jobId] || [];
      
      // Normalize message for deduplication
      const normalizedMessage = message.trim();
      
      // Only deduplicate if the message is exactly the same as the last one
      const lastLog = jobLogs[jobLogs.length - 1];
      if (lastLog && lastLog.text === normalizedMessage) {
        return updatedLogs;
      }

      // Add timestamp if not present
      const timestamp = new Date().toISOString();
      
      // Generate a truly unique ID using timestamp, random value, and array length
      const uniqueId = Date.now() * 1000000 + Math.floor(Math.random() * 1000000) + jobLogs.length;
      
      // Add the new log
      updatedLogs[jobId] = [...jobLogs, { id: uniqueId, text: normalizedMessage, timestamp }];
      
      // Keep only the last 1000 logs to prevent memory issues
      if (updatedLogs[jobId].length > 1000) {
        updatedLogs[jobId] = updatedLogs[jobId].slice(-1000);
      }

      return updatedLogs;
    });
  };

  // Add server ping test
  const pingServer = async (url: string): Promise<boolean> => {
    try {
      // Get the proper headers including X-User-Id
      const headers = getHeaders({ 'Content-Type': 'application/json' });
      
      // Get the user ID to also append as query parameter
      const userId = getUserId();
      // Create URL with userId parameter
      const pingUrl = `${url}/ping${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`;
      
      const response = await fetch(pingUrl, {
        method: 'GET',
        headers,
        // Short timeout to avoid long waits
        signal: AbortSignal.timeout(3000)
      });
      
      if (response.ok) {
        console.log("✅ Backend server is available");
        return true;
      }
      
      console.error("❌ Backend server ping failed with status:", response.status);
      return false;
    } catch (error) {
      console.error("❌ Backend server ping failed:", error);
      return false;
    }
  };

  // Modified connectSocketIO with ping test
  const connectSocketIO = async (userIdToSend?: string) => {
    // Check for existing connection and clean up if needed
    if (socket.current) {
        try {
            socket.current.disconnect();
        } catch (e) {
            console.error("Error disconnecting existing Socket.IO:", e);
        }
        socket.current = null;
    }

    console.log("🔌 Attempting to connect to Socket.IO...");
    
    try {
        // Use environment variable for socket URL
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://4.224.100.78:5000/';
        
        // Test if server is reachable before connecting
        const isServerAvailable = await pingServer(socketUrl);
        if (!isServerAvailable) {
          console.error("❌ Cannot connect - backend server is not responding");
          setIsConnected(false);
          
          // Try again after delay
          setTimeout(() => connectSocketIO(userIdToSend), 5000);
          return;
        }
        console.log("Socket URL:", socketUrl);
        
        // Ensure we always have a user ID
        let effectiveUserId = userIdToSend || userId;
        if (!effectiveUserId && typeof window !== 'undefined') {
            // Generate a temporary user ID if none exists
            effectiveUserId = `user_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
            console.log("Generated temporary user ID:", effectiveUserId);
            localStorage.setItem('userId', effectiveUserId);
            setUserId(effectiveUserId);
        }
        
        if (!effectiveUserId) {
            console.error("❌ No user ID available for Socket.IO connection");
            return;
        }

        // Configure Socket.IO client with simple, reliable settings
        socket.current = io(socketUrl, {
            transports: ['polling', 'websocket'],  // Start with polling then upgrade to websocket
            reconnection: true,
            reconnectionAttempts: 10,  // Increased from Infinity
            reconnectionDelay: 2000,   // Increased from 1000
            reconnectionDelayMax: 30000, // Increased from 5000
            autoConnect: true,
            forceNew: true,
            timeout: 25000,  // Added explicit timeout
            query: {
                userId: effectiveUserId,
                timestamp: Date.now()
            },
            auth: {
                'X-User-Id': effectiveUserId
            },
            upgrade: true,
            rememberUpgrade: true,
            path: '/socket.io/'
        }) as unknown as ExtendedSocket;

        // Connection event handlers
        socket.current.on('connect', () => {
            console.log("✅ Socket.IO connected successfully");
            setIsConnected(true);
            
            // Send init message
            if (socket.current && socket.current.connected) {
                console.log("📤 Sending init message with user ID:", effectiveUserId);
                socket.current.emit('init', { 
                    type: "init", 
                    user_id: effectiveUserId,
                    action: "subscribe",
                    timestamp: new Date().toISOString()
                });
            }
        });

        socket.current.on('disconnect', () => {
            console.log("❌ Socket.IO disconnected");
            setIsConnected(false);
            
            // Attempt to reconnect after a short delay
            setTimeout(() => {
                if (!socket.current?.connected) {
                    console.log("🔄 Attempting to reconnect after disconnect...");
                    connectSocketIO(effectiveUserId);
                }
            }, 2000);
        });
        
        socket.current.on('connect_error', (error) => {
            console.error("❌ Socket.IO connection error:", error);
            setIsConnected(false);
            
            // Attempt to reconnect after error
            setTimeout(() => {
                if (!socket.current?.connected) {
                    console.log("🔄 Attempting to reconnect after error...");
                    connectSocketIO(effectiveUserId);
                }
            }, 2000);
        });
        
        // Message handlers
        socket.current.on('log', (data: WebSocketMessage) => {
            console.log("📥 Received log message:", data);
            handleSocketMessage(data);
        });
        
        socket.current.on('state', (data: WebSocketMessage) => {
            console.log("📥 Received state message:", data);
            handleSocketMessage(data);
        });
        
        socket.current.on('connection', (data: WebSocketMessage) => {
            console.log("📥 Received connection message:", data);
            handleSocketMessage(data);
            
            // Update connection status based on message
            if (data.status === 'connected') {
                setIsConnected(true);
            }
        });
    } catch (error) {
        console.error("❌ Error creating Socket.IO connection:", error);
        setIsConnected(false);
    }
};

  const disconnectSocketIO = () => {
    if (socket.current) {
      socket.current.disconnect();
      socket.current = null;
    }
  }

  const runScraper = async () => {
    if (!userId || !isConnected) {
      const errorMessage = !isConnected 
        ? "Error: Socket.IO not connected. Please wait for connection..."
        : "Error: No user ID available";
      
      // Generate a unique ID for error messages with extra randomness
      const uniqueId = Date.now() * 1000000 + Math.floor(Math.random() * 1000000);
      
      setJobLogs((prevLogs: JobLogs) => {
        const temp = prevLogs.temp || [];
        return {
          ...prevLogs,
          temp: [...temp, { id: uniqueId, text: errorMessage }]
        };
      });
      return;
    }
    
    // Switch to logs tab when starting web scraper
    setActiveTab("logs");
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      // Use getHeaders to include X-User-Id header
      const headers = getHeaders();
      const response = await axios.post<ScraperResponse>(
        `${apiUrl}/run-scraper`, 
        { user_id: userId },
        { headers }
      );
      const jobId = response.data.job_id;
      
      if (!jobId) {
        throw new Error("No job ID received from server");
      }

      // Set active job ID first
      setActiveJobId(jobId);
      
      // Ensure logs array exists for this job, but don't clear existing logs
      setJobLogs((prevLogs: JobLogs) => {
        if (!prevLogs[jobId]) {
          return {
            ...prevLogs,
            [jobId]: []
          };
        }
        // Return unchanged if logs already exist
        return prevLogs;
      });

      // Set job states
      setLoadingJobs(prev => ({ ...prev, [jobId]: true }));
      setRunningJobs(prev => ({ ...prev, [jobId]: true }));
      
      // Add initial log message
      const initialMessage = "Scraper started successfully";
      handleLogMessage(jobId, initialMessage);
      
      if (response.data.message) {
        handleLogMessage(jobId, response.data.message);
      }
      
      console.log("Scraper started with job ID:", jobId);
    } catch (error: any) {
      const errorMessage = error.code === 'ERR_NETWORK'
        ? "Error: Please ensure the scraper server is running on port 5000"
        : `Error: ${error.response?.data?.message || error.message}`;

      // Generate a unique ID for error messages with extra randomness
      const errorId = Date.now() * 1000000 + Math.floor(Math.random() * 1000000);
      
      setJobLogs((prevLogs: JobLogs) => {
        const temp = prevLogs.temp || [];
        return {
          ...prevLogs,
          temp: [...temp, { id: errorId, text: errorMessage }]
        };
      });
      
      setLoadingJobs({});
      setRunningJobs({});
      setStoppingJobs({});
      setActiveJobId(null);
    }
  }

  const stopScraper = async (jobId: string) => {
    if (!runningJobs[jobId] || stoppingJobs[jobId]) return;
    
    console.log("Stopping scraper with job ID:", jobId);
    setStoppingJobs(prev => ({ ...prev, [jobId]: true }));
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ;
      // Use getHeaders to include X-User-Id header
      const headers = getHeaders();
      const response = await axios.post<ScraperResponse>(
        `${apiUrl}/stop-scraper`,
        { job_id: jobId },
        { headers }
      );
      
      if (response.data.message) {
        handleLogMessage(jobId, response.data.message);
      }
      
      // Reset stopping state after successful stop
      setStoppingJobs(prev => ({ ...prev, [jobId]: false }));
      setRunningJobs(prev => ({ ...prev, [jobId]: false }));
    } catch (error: any) {
      console.error("Error stopping scraper:", error);
      
      // Generate a unique ID for error messages with extra randomness
      const errorId = Date.now() * 1000000 + Math.floor(Math.random() * 1000000);
      
      const errorMessage = `Error: ${error.response?.data?.message || error.message}`;
      
      setJobLogs((prevLogs: JobLogs) => {
        const existingLogs = prevLogs[jobId] || [];
        return {
          ...prevLogs,
          [jobId]: [...existingLogs, { id: errorId, text: errorMessage }]
        };
      });
      
      // Reset stopping state on error
      setStoppingJobs(prev => ({ ...prev, [jobId]: false }));
    }
  }

  const clearLogs = (jobId: string) => {
    if (!jobId) return;
    
    console.log(`Clearing logs for job: ${jobId}`);
    
    setJobLogs((prevLogs: JobLogs) => {
      // Create a new logs object with an empty array for the specified job
      // while preserving logs for all other jobs
      return {
        ...prevLogs,
        [jobId]: []
      };
    });
    
    console.log(`Cleared logs for job: ${jobId}`);
  }

  // Get current job's logs
  const currentLogs = useMemo(() => {
    return activeJobId ? (jobLogs[activeJobId] || []) : [];
  }, [activeJobId, jobLogs, forceRefresh]);

  return (
    <div className="container py-8 mx-auto">
      <h1 className="text-3xl font-bold mb-6">Web Scraper</h1>
      <div className="grid gap-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
          </TabsList>

          <TabsContent value="config">
            <Card className="mb-8">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Configure Scraping</CardTitle>
                  <div className="flex items-center space-x-2">
                    {Object.values(runningJobs).some(Boolean) ? (
                      <Button 
                        onClick={() => {
                          const runningJobId = Object.entries(runningJobs)
                            .find(([_, running]) => running)?.[0];
                          if (runningJobId) {
                            stopScraper(runningJobId);
                          }
                        }} 
                        variant="destructive"
                        disabled={Object.values(stoppingJobs).some(Boolean)} 
                        className="flex items-center space-x-2"
                      >
                        {Object.values(stoppingJobs).some(Boolean) ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            <span>Stopping...</span>
                          </>
                        ) : (
                          <>
                            <Square className="mr-2 h-4 w-4" />
                            <span>Stop Scraper</span>
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button 
                        onClick={runScraper} 
                        disabled={Object.values(loadingJobs).some(Boolean)} 
                        className="flex items-center space-x-2"
                      >
                        {Object.values(loadingJobs).some(Boolean) ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            <span>Starting...</span>
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            <span>Run Scraper</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <CardDescription>Configure the web scraper settings</CardDescription>
              </CardHeader>
              <CardContent>
                <ConfigEditor />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results">
            <JobsList isActive={activeTab === "results"} />
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center" style={{width: '100%'}}>
                  <div className="flex items-center space-x-4">
                    <CardTitle>Scraping Logs</CardTitle>
                    {Object.entries(runningJobs).map(([jobId, isRunning]) => 
                      isRunning && (
                        <Button 
                          key={jobId}
                          onClick={() => stopScraper(jobId)} 
                          variant="destructive"
                          disabled={stoppingJobs[jobId]} 
                          className="flex items-center space-x-2"
                          size="sm"
                        >
                          {stoppingJobs[jobId] ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              <span>Stopping {jobId.slice(0, 8)}...</span>
                            </>
                          ) : (
                            <>
                              <Square className="mr-2 h-4 w-4" />
                              <span>Stop {jobId.slice(0, 8)}</span>
                            </>
                          )}
                        </Button>
                      )
                    )}
                  </div>
                  {Object.keys(jobLogs).length > 1 && (
                    <Select
                      value={activeJobId || ""}
                      onValueChange={(value: string) => setActiveJobId(value)}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select job" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(jobLogs).map((jobId: string) => (
                          <SelectItem key={jobId} value={jobId}>
                            {jobId === "system" ? "System Messages" : `Job: ${jobId.slice(0, 8)}...`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <CardDescription>
                  View the execution logs from the scraping process
                  <span className={`ml-3 inline-flex items-center px-2 py-1 rounded-full ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} text-sm font-medium`}>
                    <span className={`mr-1.5 h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                  {Object.entries(runningJobs).map(([jobId, isRunning]: [string, boolean]) => 
                    isRunning && (
                      <span key={jobId} className="ml-2 text-xs">
                        {stoppingJobs[jobId] ? `Stopping scraper (Job ID: ${jobId})...` : `Scraper running (Job ID: ${jobId})...`}
                      </span>
                    )
                  )}
                  {activeJobId === "system" && (
                    <span className="ml-2 text-xs font-bold">
                      Viewing system messages
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-end mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => clearLogs(activeJobId || "")}
                  >
                    Clear Logs
                  </Button>
                </div>

                <ScrollArea className="relative h-[500px]  rounded-md border p-4 bg-black">
                  {activeJobId && jobLogs[activeJobId] ? (
                    jobLogs[activeJobId].length > 0 ? (
                      <div className="space-y-1 font-mono text-sm overflow-x-auto">
                        {jobLogs[activeJobId].map((entry, index) => {
                          const isError = entry.text.toLowerCase().includes('error');
                          return (
                            <div 
                              key={`${entry.id}-${index}`} 
                              className={`whitespace-pre-wrap break-all ${isError ? 'text-red-500' : 'text-green-500'}`}
                            >
                              {entry.text}
                            </div>
                          );
                        })}
                        <div ref={endOfLogsRef} />
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No logs yet.
                      </div>
                    )
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="mx-auto h-8 w-8 mb-2" />
                      <p>No logs available. Start the scraper to see logs.</p>
                    </div>
                  )}
                </ScrollArea>

                {!isConnected && (
                  <Alert className="mt-4 border-red-600 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertTitle className="text-red-600">Connection Error</AlertTitle>
                    <AlertDescription>
                      Socket.IO connection lost. Please check that the backend server is running.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {showDebug && <SocketDebug isConnected={isConnected} userId={userId} socket={socket} />}
      </div>
    </div>
  )
}
