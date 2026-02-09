import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ChatInterface } from "@/components/chat-interface";
import { OuraConnection } from "@/components/oura-connection";
import { MetricCards } from "@/components/metric-cards";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, BarChart3, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ChatMessage } from "@shared/schema";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [activeTab, setActiveTab] = useState("chat");
  const { toast } = useToast();

  const { data: connectionStatus, isLoading: isCheckingConnection, refetch: refetchConnection } = useQuery<{ connected: boolean; reason?: string }>({
    queryKey: ["/api/oura/status"],
  });

  const { data: metrics, isLoading: isLoadingMetrics, refetch: refetchMetrics } = useQuery<{
    sleepScore: number | null;
    activityScore: number | null;
    readinessScore: number | null;
    restingHR: number | null;
  }>({
    queryKey: ["/api/oura/metrics"],
    enabled: connectionStatus?.connected === true,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");

    if (connected === "true") {
      toast({
        title: "Connected",
        description: "Your Oura ring is now connected.",
      });
      refetchConnection();
      refetchMetrics();
      window.history.replaceState({}, "", "/");
    }

    if (error) {
      const errorMessages: Record<string, string> = {
        access_denied: "You denied access to your Oura data.",
        no_code: "Authorization failed. Please try again.",
        invalid_state: "Invalid authorization state. Please try again.",
        token_exchange_failed: "Failed to complete authorization. Please try again.",
      };
      toast({
        title: "Connection Failed",
        description: errorMessages[error] || "An error occurred. Please try again.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/");
    }
  }, [toast, refetchConnection, refetchMetrics]);

  const handleConnectionChange = () => {
    refetchConnection();
    queryClient.invalidateQueries({ queryKey: ["/api/oura/metrics"] });
  };

  const handleRefreshMetrics = async () => {
    await refetchMetrics();
    toast({
      title: "Refreshed",
      description: "Your metrics have been updated.",
    });
  };

  const handleSendMessage = useCallback(async (content: string) => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    // Build conversation history from existing messages (before adding new user message)
    const conversationHistory = messages.slice(-10).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setStreamingContent("");

    try {
      const response = await fetch("/api/oura/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: content,
          conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";
      let ouraData = null;
      let receivedDone = false;
      let streamError: Error | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullContent += data.content;
                setStreamingContent(fullContent);
              }
              if (data.ouraData) {
                ouraData = data.ouraData;
              }
              if (data.done) {
                receivedDone = true;
              }
              if (data.error) {
                streamError = new Error(data.error);
              }
            } catch (e) {
              console.warn("Skipping malformed SSE chunk:", line);
            }
          }
        }
      }

      if (streamError) {
        throw streamError;
      }

      if (fullContent) {
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: fullContent,
          timestamp: new Date(),
          ouraData,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setStreamingContent("");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const isConnected = connectionStatus?.connected === true;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-chart-3 flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold" data-testid="text-app-title">Oura Insights</h1>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefreshMetrics}
                disabled={isLoadingMetrics}
                data-testid="button-refresh-metrics"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingMetrics ? "animate-spin" : ""}`} />
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {!isConnected && !isCheckingConnection ? (
          <div className="py-12">
            <OuraConnection
              isConnected={false}
              reason={connectionStatus?.reason}
              onConnectionChange={handleConnectionChange}
            />
          </div>
        ) : isCheckingConnection ? (
          <div className="py-12">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin" />
              <p className="text-muted-foreground">Checking connection...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <MetricCards
              sleepScore={metrics?.sleepScore ?? null}
              activityScore={metrics?.activityScore ?? null}
              readinessScore={metrics?.readinessScore ?? null}
              restingHR={metrics?.restingHR ?? null}
              isLoading={isLoadingMetrics}
            />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
                <TabsTrigger value="chat" className="gap-2" data-testid="tab-chat">
                  <MessageSquare className="w-4 h-4" />
                  Ask Questions
                </TabsTrigger>
                <TabsTrigger value="data" className="gap-2" data-testid="tab-data">
                  <BarChart3 className="w-4 h-4" />
                  View Data
                </TabsTrigger>
              </TabsList>

              <TabsContent value="chat" className="mt-6">
                <div className="bg-card rounded-2xl border min-h-[500px] flex flex-col">
                  <ChatInterface
                    messages={messages}
                    isLoading={isLoading}
                    streamingContent={streamingContent}
                    onSendMessage={handleSendMessage}
                  />
                </div>
              </TabsContent>

              <TabsContent value="data" className="mt-6">
                <DataDashboard />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      <footer className="border-t py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Powered by Oura API v2 and AI</p>
        </div>
      </footer>
    </div>
  );
}

function DataDashboard() {
  const { data: sleepData, isLoading: isLoadingSleep } = useQuery<any[]>({
    queryKey: ["/api/oura/sleep"],
  });

  const { data: activityData, isLoading: isLoadingActivity } = useQuery<any[]>({
    queryKey: ["/api/oura/activity"],
  });

  const { data: readinessData, isLoading: isLoadingReadiness } = useQuery<any[]>({
    queryKey: ["/api/oura/readiness"],
  });

  const isLoading = isLoadingSleep || isLoadingActivity || isLoadingReadiness;

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-muted-foreground/20 border-t-primary animate-spin" />
        <p className="text-muted-foreground">Loading your data...</p>
      </div>
    );
  }

  const hasData = sleepData?.length || activityData?.length || readinessData?.length;

  if (!hasData) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
        <h3 className="text-lg font-semibold mb-2">No Data Available</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          Start asking questions in the chat to see your Oura data visualized here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sleepData && sleepData.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Sleep History</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sleepData.slice(0, 7).map((day: any) => (
              <div key={day.id} className="p-4 rounded-xl bg-card border">
                <p className="text-sm text-muted-foreground">{formatDate(day.day)}</p>
                <p className="text-2xl font-bold mt-1">{day.score ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Sleep Score</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activityData && activityData.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Activity History</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activityData.slice(0, 7).map((day: any) => (
              <div key={day.id} className="p-4 rounded-xl bg-card border">
                <p className="text-sm text-muted-foreground">{formatDate(day.day)}</p>
                <p className="text-2xl font-bold mt-1">{day.steps?.toLocaleString() ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Steps</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {readinessData && readinessData.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Readiness History</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {readinessData.slice(0, 7).map((day: any) => (
              <div key={day.id} className="p-4 rounded-xl bg-card border">
                <p className="text-sm text-muted-foreground">{formatDate(day.day)}</p>
                <p className="text-2xl font-bold mt-1">{day.score ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Readiness Score</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
