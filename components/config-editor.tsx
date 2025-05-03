"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Plus, X, Save, ArrowUp, ArrowDown, Settings2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { apiFetch, getUserId } from "@/utils/api"
import { Info } from "lucide-react"
import { InfoIcon } from "lucide-react"

interface Field {
  key: string
  selector: string
  isAttribute: boolean
  attribute: string
  isLink?: boolean
}

interface ConfigField {
  selector?: string
  attribute?: string
  is_link?: boolean
}

interface Config {
  base_url: string
  container_selector: string
  scroll: boolean
  scroll_wait: number
  initial_wait: number
  paginate: boolean
  start_page: number
  max_pages: number
  next_page_selector: string
  page_wait: number
  max_scroll_attempts: number
  load_more_selector: string
  load_more_wait: number
  fields: Record<string, string | ConfigField>
  scrape_subpages: boolean
  subpage_wait: number
  subpage_fields: Record<string, string | ConfigField>
  output_json: string
  output_excel: string
}

const SelectorHelper = () => {
  const navigateToExtension = () => {
    window.open('https://chromewebstore.google.com/detail/inspect-css/fbopfffegfehobgoommphghohinpkego', '_blank')
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="ml-2">
          <InfoIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inspect CSS Extension</DialogTitle>
          <DialogDescription>
            Use the Inspect CSS Chrome extension for easy CSS inspection and editing:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
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
          </div>
          <Button 
            className="w-full"
            onClick={navigateToExtension}
          >
            Install Inspect CSS Extension
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function ConfigEditor() {
  const [userId, setUserId] = useState<string>('');
  const [config, setConfig] = useState<Config | null>(null);
  const [jsonView, setJsonView] = useState(false);
  const [fields, setFields] = useState<Field[]>([]);
  const [subpageFields, setSubpageFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialize userId on client-side only
  useEffect(() => {
    const id = getUserId();
    if (id) {
      setUserId(id);
    } else {
      console.error('Failed to initialize user ID');
    }
  }, []);

  useEffect(() => {
    const fetchConfig = async () => {
      if (!userId) {
        console.log('Waiting for user ID...');
        return;
      }

      try {
        console.log('Fetching config for user:', userId);
        const response = await apiFetch('/get-config', {
          headers: {
            'X-User-Id': userId
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch config: ${response.status}`);
        }

        const data = await response.json();
        console.log('Received config:', data);
        
        setConfig(data);
        
        // Initialize fields from the loaded config
        const loadedFields = Object.entries(data.fields).map(([key, value]) => {
          if (typeof value === "string") {
            return { key, selector: value, isAttribute: false, attribute: "" }
          } else {
            return {
              key,
              selector: (value as ConfigField).selector || "",
              isAttribute: true,
              attribute: (value as ConfigField).attribute || "",
              isLink: (value as ConfigField).is_link || false
            }
          }
        });
        setFields(loadedFields);

        // Initialize subpage fields
        const loadedSubpageFields = Object.entries(data.subpage_fields || {}).map(([key, value]) => {
          if (typeof value === "string") {
            return { key, selector: value, isAttribute: false, attribute: "" }
          } else {
            return {
              key,
              selector: (value as ConfigField).selector || "",
              isAttribute: true,
              attribute: (value as ConfigField).attribute || ""
            }
          }
        });
        setSubpageFields(loadedSubpageFields);
      } catch (error) {
        console.error('Error loading configuration:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [userId]);

  const updateConfig = (newFields?: Field[], newSubpageFields?: Field[]) => {
    if (!config) return;
    
    const fieldsToUpdate = newFields || fields;
    const subpageFieldsToUpdate = newSubpageFields || subpageFields;
    
    const updatedFields: Record<string, string | ConfigField> = {};
    const updatedSubpageFields: Record<string, string | ConfigField> = {};

    fieldsToUpdate.forEach((field) => {
      if (field.isAttribute) {
        updatedFields[field.key] = {
          selector: field.selector,
          attribute: field.attribute,
          is_link: field.isLink
        };
      } else {
        updatedFields[field.key] = field.selector;
      }
    });

    subpageFieldsToUpdate.forEach((field) => {
      if (field.isAttribute) {
        updatedSubpageFields[field.key] = {
          selector: field.selector,
          attribute: field.attribute
        };
      } else {
        updatedSubpageFields[field.key] = field.selector;
      }
    });

    setConfig({
      ...config,
      fields: updatedFields,
      subpage_fields: updatedSubpageFields
    });
  };

  const handleInputChange = (key: keyof Config, value: any) => {
    if (!config) return;
    setConfig({
      ...config,
      [key]: value,
    });
  };

  const addField = () => {
    setFields([...fields, { key: "", selector: "", isAttribute: false, attribute: "" }]);
    updateConfig();
  };

  const removeField = (index: number) => {
    const newFields = [...fields];
    newFields.splice(index, 1);
    setFields(newFields);
    updateConfig(newFields);
  };

  const updateField = (index: number, key: string, value: any) => {
    const newFields = [...fields]
    newFields[index] = { ...newFields[index], [key]: value }
    setFields(newFields)
    updateConfig(newFields)
  }

  const addSubpageField = () => {
    setSubpageFields([...subpageFields, { key: "", selector: "", isAttribute: false, attribute: "" }]);
    updateConfig();
  };

  const removeSubpageField = (index: number) => {
    const newSubpageFields = [...subpageFields];
    newSubpageFields.splice(index, 1);
    setSubpageFields(newSubpageFields);
    updateConfig(undefined, newSubpageFields);
  };

  const updateSubpageField = (index: number, key: string, value: any) => {
    const newSubpageFields = [...subpageFields];
    newSubpageFields[index] = { ...newSubpageFields[index], [key]: value };
    setSubpageFields(newSubpageFields);
    updateConfig(undefined, newSubpageFields);
  };

 const handleSave = async () => {
  try {
    updateConfig(); // Ensure this is called before saving
    
    if (!config) {
      throw new Error('No configuration to save');
    }

    console.log('Saving configuration...');
    console.log('Current user ID:', userId);
    
    const configJson = JSON.stringify(config, null, 2);
    console.log('Configuration to save:', config);
    
    const response = await apiFetch('/update-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId
      },
      body: configJson,
    });

    console.log('Save response status:', response.status);
    console.log('Save response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('Error response:', errorData);
      throw new Error(
        errorData?.message || 
        `Server returned ${response.status}: ${response.statusText}`
      );
    }

    const result = await response.json();
    console.log('Save result:', result);
    
    if (result.status === 'error') {
      throw new Error(result.message || 'Unknown error occurred');
    }

    alert(result.message || 'Configuration saved successfully');
  } catch (error) {
    console.error('Save error:', error);
    alert(`Error saving configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

  const handleImport = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          try {
            const importedConfig = JSON.parse(event.target?.result as string)
            setConfig(importedConfig)

            // Update fields state based on imported config
            const importedFields = Object.entries(importedConfig.fields).map(([key, value]) => {
              if (typeof value === "string") {
                return { key, selector: value, isAttribute: false, attribute: "" }
              } else {
                return {
                  key,
                  selector: (value as any).selector,
                  isAttribute: true,
                  attribute: (value as any).attribute,
                }
              }
            })
            setFields(importedFields)
          } catch (error) {
            alert("Invalid JSON file")
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "scrape_config.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Web Scraper Configuration</CardTitle>
              <CardDescription>
                {userId ? (
                  <>Configuration for User: <code className="px-1 py-0.5 bg-muted rounded">{userId}</code></>
                ) : (
                  'Initializing...'
                )}
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Label htmlFor="json-view">JSON View</Label>
              <Switch id="json-view" checked={jsonView} onCheckedChange={setJsonView} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!jsonView ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="base-url">Base URL</Label>
                  <Input
                    id="base-url"
                    value={config?.base_url || ""}
                    onChange={(e) => handleInputChange("base_url", e.target.value)}
                    placeholder="Enter the base URL to scrape"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="container_selector">Container Selector</Label>
                  <div className="flex items-center">
                    <Input
                      id="container_selector"
                      value={config?.container_selector ?? ""}
                      onChange={(e) => handleInputChange("container_selector", e.target.value)}
                      placeholder=".item-card, .product, etc."
                    />
                    <SelectorHelper />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 items-center">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="scroll"
                    checked={config?.scroll ?? false}
                    onCheckedChange={(checked) => handleInputChange("scroll", checked)}
                  />
                  <Label htmlFor="scroll">Enable Scrolling</Label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="initial_wait">Initial Wait (seconds)</Label>
                    <Input
                      id="initial_wait"
                      type="number"
                      value={config?.initial_wait ?? 5}
                      onChange={(e) => handleInputChange("initial_wait", Number(e.target.value))}
                      min="0"
                      step="0.5"
                    />
                  </div>

                  {config?.scroll && (
                    <div className="space-y-2">
                      <Label htmlFor="scroll_wait">Scroll Wait (seconds)</Label>
                      <Input
                        id="scroll_wait"
                        type="number"
                        value={config?.scroll_wait ?? 3}
                        onChange={(e) => handleInputChange("scroll_wait", Number(e.target.value))}
                        min="0"
                        step="0.5"
                      />
                    </div>
                  )}
                </div>
              </div>

              {config?.scroll && (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="max_scroll_attempts">Max Scroll Attempts</Label>
                    <Input
                      id="max_scroll_attempts"
                      type="number"
                      value={config?.max_scroll_attempts ?? 20}
                      onChange={(e) => handleInputChange("max_scroll_attempts", Number(e.target.value))}
                      min="1"
                      step="1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="load_more_selector">Load More Button Selector</Label>
                    <div className="flex items-center">
                      <Input
                        id="load_more_selector"
                        value={config?.load_more_selector ?? ""}
                        onChange={(e) => handleInputChange("load_more_selector", e.target.value)}
                        placeholder="button.load-more, .show-more, etc."
                      />
                      <SelectorHelper />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="load_more_wait">Load More Wait (seconds)</Label>
                    <Input
                      id="load_more_wait"
                      type="number"
                      value={config?.load_more_wait ?? 3}
                      onChange={(e) => handleInputChange("load_more_wait", Number(e.target.value))}
                      min="0"
                      step="0.5"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 border-t pt-4 mt-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="paginate"
                    checked={config?.paginate ?? false}
                    onCheckedChange={(checked) => handleInputChange("paginate", checked)}
                  />
                  <Label htmlFor="paginate">Enable Pagination</Label>
                </div>
                {config?.paginate && (
                  <div className="space-y-4 pt-4 mt-4">
                    <h4 className="font-medium mb-4">Pagination Settings</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="next_page_selector">Next Page Selector</Label>
                        <div className="flex items-center">
                          <Input
                            id="next_page_selector"
                            value={config?.next_page_selector ?? ""}
                            onChange={(e) => handleInputChange("next_page_selector", e.target.value)}
                            placeholder=".pagination .next, .load-more, etc."
                          />
                          <SelectorHelper />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="page_wait">Page Wait (seconds)</Label>
                        <Input
                          id="page_wait"
                          type="number"
                          value={config?.page_wait ?? 0}
                          onChange={(e) => handleInputChange("page_wait", Number(e.target.value))}
                          min="0"
                          step="0.5"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="start_page">Start Page</Label>
                        <Input
                          id="start_page"
                          type="number"
                          value={config?.start_page ?? 1}
                          onChange={(e) => handleInputChange("start_page", Number(e.target.value))}
                          min="1"
                          step="1"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="max_pages">Max Pages</Label>
                        <Input
                          id="max_pages"
                          type="number"
                          value={config?.max_pages ?? 1}
                          onChange={(e) => handleInputChange("max_pages", Number(e.target.value))}
                          min="1"
                          step="1"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4 mt-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="scrape_subpages"
                    checked={config?.scrape_subpages ?? false}
                    onCheckedChange={(checked) => handleInputChange("scrape_subpages", checked)}
                  />
                  <Label htmlFor="scrape_subpages">Enable Subpage Scraping</Label>
                </div>

                {config?.scrape_subpages && (
                  <div className="space-y-2">
                    <Label htmlFor="subpage_wait">Subpage Wait (seconds)</Label>
                    <Input
                      id="subpage_wait"
                      type="number"
                      value={config?.subpage_wait ?? 3}
                      onChange={(e) => handleInputChange("subpage_wait", Number(e.target.value))}
                      min="0"
                      step="0.5"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Textarea
                className="font-mono h-[500px]"
                value={config ? JSON.stringify(config, null, 2) : ""}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setConfig(parsed as Config);
                    
                    // Update fields from the JSON
                    const loadedFields = Object.entries(parsed.fields).map(([key, value]) => {
                      if (typeof value === "string") {
                        return { key, selector: value, isAttribute: false, attribute: "" }
                      } else {
                        return {
                          key,
                          selector: (value as ConfigField).selector || "",
                          isAttribute: true,
                          attribute: (value as ConfigField).attribute || "",
                          isLink: (value as ConfigField).is_link || false
                        }
                      }
                    });
                    setFields(loadedFields);

                    // Update subpage fields from the JSON
                    const loadedSubpageFields = Object.entries(parsed.subpage_fields || {}).map(([key, value]) => {
                      if (typeof value === "string") {
                        return { key, selector: value, isAttribute: false, attribute: "" }
                      } else {
                        return {
                          key,
                          selector: (value as ConfigField).selector || "",
                          isAttribute: true,
                          attribute: (value as ConfigField).attribute || ""
                        }
                      }
                    });
                    setSubpageFields(loadedSubpageFields);
                  } catch (error) {
                    // Allow invalid JSON during editing
                  }
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fields to Extract</CardTitle>
          <CardDescription>Define what data to extract from each container</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={index} className="grid gap-4 p-4 border rounded-lg">
                <div className="flex justify-between">
                  <h4 className="font-medium">Field #{index + 1}</h4>
                  <Button variant="outline" size="sm" onClick={() => removeField(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`field-key-${index}`}>Field Name</Label>
                    <Input
                      id={`field-key-${index}`}
                      value={field.key}
                      onChange={(e) => updateField(index, "key", e.target.value)}
                      placeholder="name, price, description, etc."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`field-selector-${index}`}>CSS Selector</Label>
                    <div className="flex items-center">
                      <Input
                        id={`field-selector-${index}`}
                        value={field.selector}
                        onChange={(e) => updateField(index, "selector", e.target.value)}
                        placeholder=".item-name, .price, etc."
                      />
                      <SelectorHelper />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`field-is-attribute-${index}`}
                      checked={field.isAttribute}
                      onCheckedChange={(checked) => updateField(index, "isAttribute", checked)}
                    />
                    <Label htmlFor={`field-is-attribute-${index}`}>Extract Attribute</Label>
                  </div>

                  {field.isAttribute && (
                    <div className="space-y-2">
                      <Label htmlFor={`field-attribute-${index}`}>Attribute Name</Label>
                      <Input
                        id={`field-attribute-${index}`}
                        value={field.attribute}
                        onChange={(e) => updateField(index, "attribute", e.target.value)}
                        placeholder="href, src, data-id, etc."
                      />
                    </div>
                  )}
                </div>

                {field.isAttribute && (
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`field-is-link-${index}`}
                      checked={field.isLink ?? false}
                      onCheckedChange={(checked) => updateField(index, "isLink", checked)}
                    />
                    <Label htmlFor={`field-is-link-${index}`}>Is Subpage Link</Label>
                  </div>
                )}
              </div>
            ))}

            <Button variant="outline" onClick={addField} className="w-full">
              <Plus className="mr-2 h-4 w-4" /> Add Field
            </Button>
          </div>
        </CardContent>
      </Card>

      {config?.scrape_subpages && (
        <Card>
          <CardHeader>
            <CardTitle>Subpage Fields</CardTitle>
            <CardDescription>Define what data to extract from each subpage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {subpageFields.map((field, index) => (
                <div key={index} className="grid gap-4 p-4 border rounded-lg">
                  <div className="flex justify-between">
                    <h4 className="font-medium">Subpage Field #{index + 1}</h4>
                    <Button variant="outline" size="sm" onClick={() => removeSubpageField(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`subpage-field-key-${index}`}>Field Name</Label>
                      <Input
                        id={`subpage-field-key-${index}`}
                        value={field.key}
                        onChange={(e) => updateSubpageField(index, "key", e.target.value)}
                        placeholder="bio, full_title, etc."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`subpage-field-selector-${index}`}>CSS Selector</Label>
                      <div className="flex items-center">
                        <Input
                          id={`subpage-field-selector-${index}`}
                          value={field.selector}
                          onChange={(e) => updateSubpageField(index, "selector", e.target.value)}
                          placeholder=".bio-text, .full-title, etc."
                        />
                        <SelectorHelper />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`subpage-field-is-attribute-${index}`}
                        checked={field.isAttribute}
                        onCheckedChange={(checked) => updateSubpageField(index, "isAttribute", checked)}
                      />
                      <Label htmlFor={`subpage-field-is-attribute-${index}`}>Extract Attribute</Label>
                    </div>

                    {field.isAttribute && (
                      <div className="space-y-2">
                        <Label htmlFor={`subpage-field-attribute-${index}`}>Attribute Name</Label>
                        <Input
                          id={`subpage-field-attribute-${index}`}
                          value={field.attribute}
                          onChange={(e) => updateSubpageField(index, "attribute", e.target.value)}
                          placeholder="href, src, data-id, etc."
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <Button variant="outline" onClick={addSubpageField} className="w-full">
                <Plus className="mr-2 h-4 w-4" /> Add Subpage Field
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end space-x-4">
        <Button variant="outline" onClick={handleImport}>
          <ArrowUp className="mr-2 h-4 w-4" /> Import Config
        </Button>
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" /> Save Configuration
        </Button>
        <Button variant="outline" onClick={handleExport}>
          <ArrowDown className="mr-2 h-4 w-4" /> Export Config
        </Button>
      </div>
    </div>
  )
}
