"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { FileJson, FileSpreadsheet, Loader2 } from "lucide-react"
import { apiFetch } from "@/utils/api"
import { getUserId } from "@/utils/api"

// Define a proper type for the scraped data
interface ScrapedData {
  [key: string]: string | number | boolean | null | undefined
}

interface ResultsViewerProps {
  jobId: string;
}

const userId = getUserId();

export default function ResultsViewer({ jobId }: ResultsViewerProps) {
  const [viewMode, setViewMode] = useState("table")
  const [data, setData] = useState<ScrapedData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10 // Number of items to display per page

  // Calculate the index of the last item on the current page
  const indexOfLastItem = currentPage * itemsPerPage
  // Calculate the index of the first item on the current page
  const indexOfFirstItem = indexOfLastItem - itemsPerPage
  // Get the current items
  const currentItems = data.slice(indexOfFirstItem, indexOfLastItem)

  const totalPages = Math.ceil(data.length / itemsPerPage)

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  useEffect(() => {
    if (!jobId) {
      setError("No job ID provided")
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    
    apiFetch(`/get-scraped-data/${jobId}`, {
      headers: userId ? {
        'X-User-Id': userId
      } : undefined
    })
      .then(response => {
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('No scraped data available')
          }
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        return response.json()
      })
      .then(data => {
        // Check if the response is an error message
        if (data.status === 'error') {
          throw new Error(data.message)
        }
        setData(data)
        setIsLoading(false)
      })
      .catch(error => {
        setError(error.message)
        setIsLoading(false)
      })
  }, [jobId])

  const downloadJson = () => {
    try {
      apiFetch(`/get-scraped-data/${jobId}`)
        .then(response => response.json())
        .then(data => {
          const formattedData = JSON.stringify(data, null, 2)
          const blob = new Blob([formattedData], { type: 'application/json;charset=utf-8;' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `scraped_data_${jobId}.json`;
          a.click();
          window.URL.revokeObjectURL(url);
        })
        .catch(err => {
          setError('Failed to download JSON file')
        })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download JSON')
    }
  }

  const downloadCsv = () => {
    try {
      const defaultFilename = `scraped_data_${jobId}.xlsx`;
      const filename = prompt('Enter filename for Excel download:', defaultFilename);
      
      if (!filename) return; // User cancelled the prompt
      
      apiFetch(`/get-excel-data/${jobId}`)
        .then(response => response.blob())
        .then(blob => {
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
          a.click()
          window.URL.revokeObjectURL(url)
        })
        .catch(err => {
          setError('Failed to download Excel file')
        })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download Excel file')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading data...</span>
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

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        No data available
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Scraped Results</CardTitle>
              <CardDescription>View and export the scraped data</CardDescription>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={downloadJson}>
                <FileJson className="mr-2 h-4 w-4" /> Export JSON
              </Button>
              <Button variant="outline" onClick={downloadCsv}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="table" value={viewMode} onValueChange={setViewMode}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="table">Table View</TabsTrigger>
              <TabsTrigger value="json">JSON View</TabsTrigger>
            </TabsList>

            <TabsContent value="table" className="pt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {data.length > 0 && Object.keys(data[0]).map((key) => (
                        <TableHead key={key} className="font-medium">
                          {key}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentItems.map((item, i) => (
                      <TableRow key={i}>
                        {Object.entries(item).map(([key, value]) => (
                          <TableCell key={key}>
                            {typeof value === 'string' && value.startsWith('http') ? (
                              <a
                                href={value}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {value}
                              </a>
                            ) : (
                              String(value ?? '')
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">Page {currentPage} of {totalPages} ({data.length} total items)</div>
              <div className="flex justify-between mt-4">
                <Button onClick={handlePreviousPage} disabled={currentPage === 1}>Previous</Button>
                <Button onClick={handleNextPage} disabled={currentPage === totalPages}>Next</Button>
              </div>
            </TabsContent>

            <TabsContent value="json" className="pt-4">
              <pre className="bg-slate-950 text-slate-50 p-4 rounded-md overflow-auto h-[500px] text-sm">
                {JSON.stringify(data, null, 2)}
              </pre>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}