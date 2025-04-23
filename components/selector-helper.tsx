"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function SelectorHelper() {
  const navigateToExtension = () => {
    window.open('https://chromewebstore.google.com/detail/inspect-css/fbopfffegfehobgoommphghohinpkego', '_blank')
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Inspect CSS Chrome Extension</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-muted rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Features:</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li>🔎 Get CSS Properties from any element by selecting it</li>
            <li>✏️ Get and edit element attributes</li>
            <li>📷 Download website assets</li>
            <li>⌨️ Add your custom CSS to the website</li>
            <li>🎨 Get the color palette of the website</li>
            <li>🧭 DOM Navigation</li>
            <li>🎯 Color picker</li>
          </ul>
          <Button 
            className="mt-6 w-full"
            onClick={navigateToExtension}
          >
            Install Inspect CSS Extension
          </Button>
        </div>
      </CardContent>
    </Card>
  )
} 