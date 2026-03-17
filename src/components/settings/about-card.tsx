import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ExternalLink, Github, Globe, Shield } from "lucide-react";

/**
 * Professional About Card Component
 * 
 * Displays author information in the settings page with professional presentation.
 * Includes author name, GitHub link, website link, and maintains professional
 * appearance without social media links as per requirements.
 */

export interface AboutCardProps {
  className?: string;
}

export function AboutCard({ className }: AboutCardProps): JSX.Element {
  // Author information matching backend constants
  const author = {
    name: 'Umair Farooqui',
    title: 'Software Engineer & Certified Ethical Hacker (CEH v13)',
    githubUsername: 'mufazmi',
    githubUrl: 'https://github.com/mufazmi',
    website: 'https://umairfarooqui.com',
    email: 'info.umairfarooqui@gmail.com'
  };

  const handleExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card className={className}>
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm">About</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="p-3 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium">Author</p>
            <p className="text-[10px] text-muted-foreground">Software creator and maintainer</p>
          </div>
          <span className="text-xs font-medium">{author.name}</span>
        </div>
        
        <Separator />
        
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium">Title</p>
            <p className="text-[10px] text-muted-foreground">Professional credentials</p>
          </div>
          <div className="flex items-center gap-1">
            <Shield className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-right max-w-32 leading-tight">
              {author.title}
            </span>
          </div>
        </div>
        
        <Separator />
        
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-xs font-medium mb-2">Professional Links</p>
          </div>
          
          <Button
            size="sm"
            variant="outline"
            className="gap-2 justify-start h-8"
            onClick={() => handleExternalLink(author.githubUrl)}
          >
            <Github className="w-3.5 h-3.5" />
            <span className="text-xs">GitHub Profile</span>
            <ExternalLink className="w-3 h-3 ml-auto" />
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            className="gap-2 justify-start h-8"
            onClick={() => handleExternalLink(author.website)}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="text-xs">Personal Website</span>
            <ExternalLink className="w-3 h-3 ml-auto" />
          </Button>
        </div>
        
        <Separator />
        
        <div className="bg-muted/50 rounded-md p-2">
          <p className="text-[10px] text-muted-foreground text-center">
            Rediscover - Professional Redis Management Tool
          </p>
        </div>
      </CardContent>
    </Card>
  );
}