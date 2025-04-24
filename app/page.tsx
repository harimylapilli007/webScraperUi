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
import {getUserId } from "@/utils/api"
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
    if (initialUserId) {
      setUserId(initialUserId);
      connectSocketIO(initialUserId);
    } else {
      connectSocketIO();
    }
    
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
            setRunningJobs(prev => ({ ...prev, [useJobId]: false }));
            setLoadingJobs(prev => ({ ...prev, [useJobId]: false }));
            setStoppingJobs(prev => ({ ...prev, [useJobId]: false }));
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
      setLoadingJobs((prev: LoadingJobs) => ({ ...prev, [jobId]: true }));
      setStoppingJobs((prev: StoppingJobs) => ({ ...prev, [jobId]: false }));
      
      // Add a log entry for job start
      handleLogMessage(jobId, "Scraper started running...");
    } else if (status === "stopped" || status === "error") {
      setRunningJobs((prev: RunningJobs) => ({ ...prev, [jobId]: false }));
      setLoadingJobs((prev: LoadingJobs) => ({ ...prev, [jobId]: false }));
      setStoppingJobs((prev: StoppingJobs) => ({ ...prev, [jobId]: false }));
      
      // Add a log entry for job end
      const message = status === "error" 
        ? "Scraper stopped with error"
        : "Scraper completed successfully";
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
      
      // Add the new log
      updatedLogs[jobId] = [...jobLogs, { id: Date.now(), text: normalizedMessage, timestamp }];
      
      // Keep only the last 1000 logs to prevent memory issues
      if (updatedLogs[jobId].length > 1000) {
        updatedLogs[jobId] = updatedLogs[jobId].slice(-1000);
      }

      return updatedLogs;
    });
  };

  const connectSocketIO = (userIdToSend?: string) => {
    // Check for existing connection
    if (socket.current) {
      if (socket.current.connected) {
        console.log("Socket.IO already connected")
        
        // If we have a specific user ID to send, do it now
        if (userIdToSend && socket.current.connected) {
          socket.current.emit('init', { 
            type: "init", 
            user_id: userIdToSend,
            action: "subscribe"
          });
          console.log("Sent user ID to existing Socket.IO:", userIdToSend);
        }
        return;
      }
      
      // If we get here, the connection is not connected, so clean it up
      try {
        socket.current.disconnect();
      } catch (e) {
        console.error("Error disconnecting existing Socket.IO:", e);
      }
      socket.current = null;
    }

    console.log("Attempting to connect to Socket.IO...");
    
    try {
      // Connect to Socket.IO server
      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
      socket.current = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5, // Increased from 3 to 5
        reconnectionDelay: 2000,
        timeout: 20000, // Increased from 10000 to 20000
        forceNew: true,
        autoConnect: true,
        path: '/socket.io/', // Added explicit path for Azure
        secure: process.env.NODE_ENV === 'production', // Enable secure connection in production
        rejectUnauthorized: false // Allow self-signed certificates in development
      }) as unknown as ExtendedSocket;
      
      console.log("Socket.IO connecting to:", socketUrl);
      
      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (socket.current && !socket.current.connected) {
          console.error("Socket.IO connection timeout");
          setIsConnected(false);
          
          // Clean up the socket
          try {
            socket.current.disconnect();
          } catch (e) {
            console.error("Error disconnecting on timeout:", e);
          }
          socket.current = null;
          
          // Attempt to reconnect after a longer delay
          setTimeout(() => {
            console.log("Attempting to reconnect after timeout...");
            connectSocketIO(userIdToSend);
          }, 5000); // Increased from 3000 to 5000
        }
      }, 8000); // Reduced from 5000 to 8000 to give more time for initial connection
      
      if (!socket.current) return;

      socket.current.on('connect', () => {
        console.log("Socket.IO connection established successfully");
        clearTimeout(connectionTimeout);
        setIsConnected(true);
        
        // Send user ID to Socket.IO server
        const idToSend = userIdToSend || userId;
        if (idToSend && socket.current && socket.current.connected) {
          console.log("Sending user ID to Socket.IO server:", idToSend);
          socket.current.emit('init', { 
            type: "init", 
            user_id: idToSend,
            action: "subscribe"
          });
          
          // Add debug message for monitoring connection
          console.log("Socket.IO connection established and user ID sent");
        } else {
          console.warn("No user ID available on Socket.IO connection or socket not connected");
        }
      });

      // Handle reconnection on error or close
      socket.current.on('disconnect', (reason: string) => {
        console.log("Socket.IO connection closed:", reason);
        setIsConnected(false);
        
        // Only attempt to reconnect if it wasn't a client-side disconnect
        if (reason !== "io client disconnect") {
          // Attempt to reconnect after a delay
          setTimeout(() => {
            console.log("Attempting to reconnect Socket.IO...");
            connectSocketIO(userIdToSend || (userId || undefined));
          }, 5000); // Increased from 3000 to 5000
        }
      });
      
      socket.current.on('connect_error', (error: Error) => {
        console.error("Socket.IO error:", error);
        setIsConnected(false);
        // The disconnect handler will handle reconnection
      });
      
      // Handle different message types
      socket.current.on('log', (data: WebSocketMessage) => {
        console.log("Received Socket.IO log message:", data);
        handleSocketMessage(data);
      });
      
      socket.current.on('state', (data: WebSocketMessage) => {
        console.log("Received Socket.IO state message:", data);
        handleSocketMessage(data);
      });
      
      socket.current.on('connection', (data: WebSocketMessage) => {
        console.log("Received Socket.IO connection message:", data);
        handleSocketMessage(data);
      });
      
      // Handle any other events
      socket.current.onAny((eventName: string, ...args: any[]) => {
        console.log(`Received Socket.IO event ${eventName}:`, args);
        if (args.length > 0) {
          handleSocketMessage(args[0]);
        }
      });
    } catch (error) {
      console.error("Error creating Socket.IO connection:", error);
      setIsConnected(false);
      setTimeout(() => {
        console.log("Attempting to reconnect after error...");
        connectSocketIO(userIdToSend);
      }, 5000); // Increased from 3000 to 5000
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
      
      setJobLogs((prevLogs: JobLogs) => ({
        ...prevLogs,
        temp: prevLogs.temp ? [...prevLogs.temp, { id: Date.now(), text: errorMessage }] : [{ id: Date.now(), text: errorMessage }]
      }));
      return;
    }
    
    // Switch to logs tab when starting web scraper
    setActiveTab("logs");
    
    try {
      const response = await axios.post<ScraperResponse>(`${process.env.NEXT_PUBLIC_API_URL}/run-scraper`, { user_id: userId });
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

      const errorId = Date.now();
      setJobLogs((prevLogs: JobLogs) => ({
        ...prevLogs,
        temp: prevLogs.temp ? [...prevLogs.temp, { id: errorId, text: errorMessage }] : [{ id: errorId, text: errorMessage }]
      }));
      
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
      const response = await axios.post<ScraperResponse>(
        `${process.env.NEXT_PUBLIC_API_URL}/stop-scraper`,
        { job_id: jobId },
        { headers: { 'Content-Type': 'application/json' } }
      )
      
      if (response.data.message) {
        handleLogMessage(jobId, response.data.message);
      }
    } catch (error: any) {
      console.error("Error stopping scraper:", error);
      const errorId = Date.now();
      const errorMessage = `Error: ${error.response?.data?.message || error.message}`;
      
      setJobLogs((prevLogs: JobLogs) => {
        const existingLogs = prevLogs[jobId] || [];
        return {
          ...prevLogs,
          [jobId]: [...existingLogs, { id: errorId, text: errorMessage }]
        };
      });
      
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
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">Web Scraper Dashboard</h1>

      <Tabs defaultValue="config" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <ConfigEditor />
        </TabsContent>

        <TabsContent value="results">
          <JobsList isActive={activeTab === "results"} />
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Scraping Logs</CardTitle>
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
                <span className={`ml-2 inline-block h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="ml-1 text-xs">{isConnected ? 'Connected' : 'Disconnected'}</span>
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
              <ScrollArea className="h-[400px] w-full rounded-md border p-4 bg-black text-white font-mono">
                <div style={{ width: '100%' }}>
                  {currentLogs.length === 0 ? (
                    <div className="text-gray-500 italic">No logs yet.</div>
                  ) : (
                    <div className="space-y-1">
                      {currentLogs.map((log: LogEntry, logIndex: number) => {
                        // Determine if this is an error message
                        const isError = log.text.toLowerCase().includes('error') || 
                                        log.text.toLowerCase().includes('exception') || 
                                        log.text.toLowerCase().includes('failed');
                        
                        return (
                          <pre 
                            key={`log-${log.id}-${logIndex}`} 
                            className={`${isError ? 'text-red-400' : 'text-green-400'} px-2 py-1 rounded ${isError ? 'bg-red-950/30' : ''} w-full overflow-x-auto`}
                            style={{
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              fontFamily: 'monospace',
                              fontSize: '0.875rem',
                              lineHeight: '1.5',
                            }}
                          >
                            {log.text || '\u00A0'} {/* Non-breaking space to preserve empty lines */}
                          </pre>
                        );
                      })}
                      <div ref={endOfLogsRef} />
                    </div>
                  )}
                </div>
              </ScrollArea>
              <div className="mt-2 flex justify-between">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => activeJobId && clearLogs(activeJobId)}
                  disabled={!activeJobId || currentLogs.length === 0}
                >
                  Clear Logs
                </Button>
                {Object.entries(runningJobs).map(([jobId, isRunning]: [string, boolean]) => 
                  isRunning && jobId === activeJobId && (
                    <Button
                      key={jobId}
                      variant="destructive"
                      size="sm"
                      onClick={() => stopScraper(jobId)}
                      disabled={stoppingJobs[jobId]}
                    >
                      {stoppingJobs[jobId] ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Stopping...
                        </>
                      ) : (
                        <>
                          <Square className="mr-2 h-4 w-4" /> Stop Scraper
                        </>
                      )}
                    </Button>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex justify-between">
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => setActiveTab("config")}>
            Edit Configuration
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={runScraper}
            disabled={!userId || Object.values(loadingJobs).some(isLoading => isLoading)}
          >
            {Object.values(loadingJobs).some(isLoading => isLoading) ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Run Scraper
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
