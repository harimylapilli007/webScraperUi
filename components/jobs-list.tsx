"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCwIcon } from "lucide-react"
import { apiFetch, getUserId } from "@/utils/api"
import ResultsViewer from "./results-viewer"

interface Job {
  id: string
  status: string
  start_time: string
  user_id: string
}

interface JobsListProps {
  isActive: boolean;
}

export default function JobsList({ isActive }: JobsListProps) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // Function to fetch jobs
  const fetchJobs = async () => {
    if (!userId) return;
    
    try {
      const response = await apiFetch('/list-jobs', {
        headers: {
          'X-User-Id': userId
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.status === 'error') {
        throw new Error(data.message);
      }
      // Filter jobs for current user
      const userJobs = data.filter((job: Job) => job.user_id === userId);
      
      // Only update state if jobs have changed
      const jobsChanged = JSON.stringify(userJobs) !== JSON.stringify(jobs);
      if (jobsChanged) {
        setJobs(userJobs);
      }
      
      setError(null);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const currentUserId = getUserId();
    setUserId(currentUserId);
  }, []);

  useEffect(() => {
    if (!userId || !isActive) return;

    // Initial fetch when tab becomes active
    fetchJobs();

    // Set up interval to fetch jobs every 30 seconds, but only when tab is active
    const interval = setInterval(fetchJobs, 30000);

    // Cleanup interval when component unmounts or tab becomes inactive
    return () => {
      clearInterval(interval);
    };
  }, [userId, isActive]);

  // Add refresh button functionality
  const handleRefresh = () => {
    setIsLoading(true);
    fetchJobs();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading your jobs...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        Error: {error}
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No scraping jobs found for your account. Start a new scraping job to see results here.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Your Scraping Jobs</CardTitle>
              <CardDescription>Select a job to view its results</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCwIcon className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {jobs
              .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
              .map((job) => (
              <Button
                key={job.id}
                variant={selectedJobId === job.id ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => setSelectedJobId(job.id)}
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium">Job ID: {job.id}</span>
                  <span className="text-sm text-muted-foreground">
                    Started: {job.start_time ? new Date(job.start_time).toLocaleString('en-IN', {
                      year: 'numeric',
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                      timeZone: 'Asia/Kolkata'
                    }) : 'N/A'}
                  </span>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedJobId && (
        <ResultsViewer jobId={selectedJobId} />
      )}
    </div>
  )
} 