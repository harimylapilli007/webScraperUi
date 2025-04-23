declare module 'react' {
  export = React;
  export as namespace React;
}

declare module 'lucide-react' {
  export const AlertCircle: React.FC<React.SVGProps<SVGSVGElement>>;
  export const Play: React.FC<React.SVGProps<SVGSVGElement>>;
  export const Loader2: React.FC<React.SVGProps<SVGSVGElement>>;
  export const Square: React.FC<React.SVGProps<SVGSVGElement>>;
}

declare module '@/components/ui/button' {
  export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'default' | 'destructive' | 'outline';
    size?: 'default' | 'sm' | 'lg';
  }>;
}

declare module '@/components/ui/card' {
  export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>>;
  export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>>;
  export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>>;
  export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>>;
  export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>>;
}

declare module '@/components/ui/tabs' {
  export const Tabs: React.FC<React.HTMLAttributes<HTMLDivElement> & {
    defaultValue?: string;
    value?: string;
    onValueChange?: (value: string) => void;
  }>;
  export const TabsList: React.FC<React.HTMLAttributes<HTMLDivElement>>;
  export const TabsTrigger: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & {
    value: string;
  }>;
  export const TabsContent: React.FC<React.HTMLAttributes<HTMLDivElement> & {
    value: string;
  }>;
}

declare module '@/components/ui/scroll-area' {
  export const ScrollArea: React.FC<React.HTMLAttributes<HTMLDivElement>>;
}

declare module '@/components/ui/alert' {
  export const Alert: React.FC<React.HTMLAttributes<HTMLDivElement>>;
  export const AlertDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>>;
  export const AlertTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>>;
}

declare module '@/components/ui/select' {
  export const Select: React.FC<React.HTMLAttributes<HTMLDivElement> & {
    value?: string;
    onValueChange?: (value: string) => void;
  }>;
  export const SelectTrigger: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>;
  export const SelectValue: React.FC<React.HTMLAttributes<HTMLSpanElement> & {
    placeholder?: string;
  }>;
  export const SelectContent: React.FC<React.HTMLAttributes<HTMLDivElement>>;
  export const SelectItem: React.FC<React.HTMLAttributes<HTMLDivElement> & {
    value: string;
  }>;
}

declare module '@/components/config-editor' {
  const ConfigEditor: React.FC;
  export default ConfigEditor;
}

declare module '@/components/jobs-list' {
  interface JobsListProps {
    isActive: boolean;
  }
  const JobsList: React.FC<JobsListProps>;
  export default JobsList;
}

declare module '@/utils/api' {
  export function getUserId(): string | null;
  export function apiFetch(url: string, options?: RequestInit): Promise<Response>;
} 