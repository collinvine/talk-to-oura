import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, User, Sparkles, Loader2 } from "lucide-react";
import { DataVisualization } from "./data-visualization";
import type { ChatMessage } from "@shared/schema";

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isLoading: boolean;
  streamingContent: string;
  onSendMessage: (message: string) => void;
}

export function ChatInterface({
  messages,
  isLoading,
  streamingContent,
  onSendMessage,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const suggestedQuestions = [
    "How was my sleep last night?",
    "What's my readiness score today?",
    "How active have I been this week?",
    "What are my heart rate trends?",
  ];

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto">
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-6">
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary/20 to-chart-2/20 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold mb-2" data-testid="text-welcome-title">
                Ask About Your Health
              </h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                I can answer questions about your sleep patterns, activity levels, readiness scores, and heart rate data from your Oura ring.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestedQuestions.map((question, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    onClick={() => onSendMessage(question)}
                    disabled={isLoading}
                    data-testid={`button-suggested-question-${index}`}
                  >
                    {question}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback className={message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}>
                  {message.role === "user" ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                </AvatarFallback>
              </Avatar>
              <div className={`flex-1 max-w-[80%] ${message.role === "user" ? "text-right" : ""}`}>
                <Card className={`inline-block ${message.role === "user" ? "bg-primary text-primary-foreground" : ""}`}>
                  <CardContent className="p-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed" data-testid={`text-message-${message.id}`}>
                      {message.content}
                    </p>
                  </CardContent>
                </Card>
                {message.ouraData && (
                  <div className="mt-4">
                    <DataVisualization data={message.ouraData} />
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1 px-1">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}

          {isLoading && streamingContent && (
            <div className="flex gap-3">
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback className="bg-muted">
                  <Sparkles className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 max-w-[80%]">
                <Card>
                  <CardContent className="p-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed" data-testid="text-streaming-content">
                      {streamingContent}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {isLoading && !streamingContent && (
            <div className="flex gap-3">
              <Avatar className="w-8 h-8 flex-shrink-0">
                <AvatarFallback className="bg-muted">
                  <Sparkles className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <Card className="inline-block">
                  <CardContent className="p-4 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Analyzing your Oura data...</span>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-background/80 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your Oura data..."
            className="min-h-[48px] max-h-[120px] resize-none"
            disabled={isLoading}
            data-testid="input-chat-message"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {input.length}/500 characters
        </p>
      </div>
    </div>
  );
}
