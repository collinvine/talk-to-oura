import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle, LogOut, ExternalLink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface OuraConnectionProps {
  isConnected: boolean;
  reason?: string;
  onConnectionChange: () => void;
}

export function OuraConnection({ isConnected, reason, onConnectionChange }: OuraConnectionProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/oura");
      const data = await response.json();
      
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else if (data.error) {
        console.error("OAuth error:", data.error);
      }
    } catch (error) {
      console.error("Failed to initiate OAuth:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/oura/disconnect");
      onConnectionChange();
    } catch (error) {
      console.error("Failed to disconnect:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isConnected) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-chart-2/10 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-chart-2" />
            </div>
          </div>
          <CardTitle className="text-xl">Oura Ring Connected</CardTitle>
          <CardDescription>Your Oura data is ready to query</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <Badge variant="secondary" className="gap-1">
            <Activity className="w-3 h-3" />
            Active Connection
          </Badge>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={isLoading}
              data-testid="button-disconnect-oura"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {isLoading ? "Disconnecting..." : "Disconnect"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const showOAuthNotConfigured = reason === "oauth_not_configured";

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-chart-3/20 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full border-4 border-foreground/20 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-primary" />
            </div>
          </div>
        </div>
        <CardTitle className="text-2xl">Connect Your Oura Ring</CardTitle>
        <CardDescription className="text-base mt-2">
          Link your Oura account to start asking questions about your sleep, activity, and recovery data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {showOAuthNotConfigured ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              OAuth is not configured. Please add your Oura developer credentials.
            </p>
            <a
              href="https://cloud.ouraring.com/oauth/applications"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
              data-testid="link-oura-dev-console"
            >
              Go to Oura Developer Console
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <>
            <Button
              onClick={handleConnect}
              disabled={isLoading}
              className="w-full"
              size="lg"
              data-testid="button-connect-oura"
            >
              {isLoading ? "Connecting..." : "Connect with Oura"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              You will be redirected to Oura to authorize access to your health data.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
