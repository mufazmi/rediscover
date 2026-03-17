import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Send, Plus, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/appContext";
import { connect, subscribe, unsubscribe, publish, onPubSubMessage, onPubSubError, onPubSubPublished, isConnected } from "@/lib/socket";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PubSubMessage {
  id: string;
  channel: string;
  message: string;
  timestamp: number;
}

export default function PubSub() {
  const { activeConnectionId, activeDb } = useApp();
  const [messages, setMessages] = useState<PubSubMessage[]>([]);
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [newChannel, setNewChannel] = useState("");
  const [publishChannel, setPublishChannel] = useState("");
  const [publishMessage, setPublishMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const cleanupRef = useRef<(() => void)[]>([]);
  const messageIdCounter = useRef(0);

  // Connect to Socket.io on mount
  useEffect(() => {
    try {
      const socket = connect();
      setSocketConnected(isConnected());
      
      socket.on('connect', () => {
        setSocketConnected(true);
        setError(null);
      });
      
      socket.on('disconnect', () => {
        setSocketConnected(false);
        setSubscriptions([]);
      });
      
      socket.on('connect_error', (err) => {
        setError(`Connection error: ${err.message}`);
        setSocketConnected(false);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to socket');
    }
  }, []);

  // Set up message and error listeners
  useEffect(() => {
    if (!socketConnected) {
      return;
    }

    try {
      // Listen for Pub/Sub messages
      const cleanupMessage = onPubSubMessage((data) => {
        const msg: PubSubMessage = {
          id: String(messageIdCounter.current++),
          channel: data.channel,
          message: data.message,
          timestamp: Date.now(),
        };
        setMessages(prev => [msg, ...prev.slice(0, 99)]); // Keep last 100 messages
      });

      // Listen for Pub/Sub errors
      const cleanupError = onPubSubError((data) => {
        setError(data.message);
      });

      // Listen for publish confirmations
      const cleanupPublished = onPubSubPublished((data) => {
        console.log(`Published to ${data.channel}, ${data.subscriberCount} subscribers received`);
      });

      cleanupRef.current = [cleanupMessage, cleanupError, cleanupPublished];
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up listeners');
    }

    return () => {
      cleanupRef.current.forEach(cleanup => cleanup());
      cleanupRef.current = [];
    };
  }, [socketConnected]);

  const addSubscription = () => {
    if (!newChannel) {
      return;
    }
    
    if (subscriptions.includes(newChannel)) {
      setError(`Already subscribed to ${newChannel}`);
      return;
    }
    
    if (!activeConnectionId) {
      setError('No active connection selected');
      return;
    }
    
    if (!socketConnected) {
      setError('Socket not connected');
      return;
    }

    try {
      setError(null);
      subscribe(Number(activeConnectionId), newChannel, activeDb);
      setSubscriptions([...subscriptions, newChannel]);
      setNewChannel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to subscribe');
    }
  };

  const removeSubscription = (channel: string) => {
    if (!socketConnected) {
      setError('Socket not connected');
      return;
    }

    try {
      setError(null);
      unsubscribe(channel);
      setSubscriptions(subscriptions.filter(s => s !== channel));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe');
    }
  };

  const handlePublish = () => {
    if (!publishChannel || !publishMessage) {
      return;
    }
    
    if (!activeConnectionId) {
      setError('No active connection selected');
      return;
    }
    
    if (!socketConnected) {
      setError('Socket not connected');
      return;
    }

    try {
      setError(null);
      publish(Number(activeConnectionId), publishChannel, publishMessage, activeDb);
      setPublishMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    }
  };

  const tryParseJSON = (str: string) => {
    try { return JSON.stringify(JSON.parse(str), null, 2); } catch { return str; }
  };

  return (
    <div className="h-[calc(100vh-7.5rem)] flex gap-3 flex-col">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <div className="flex gap-3 flex-1">
        {/* Subscriptions panel */}
        <Card className="w-64 shrink-0 flex flex-col">
          <CardHeader className="p-3 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Subscriptions</CardTitle>
              {!socketConnected && <Badge variant="destructive" className="text-xs">Disconnected</Badge>}
            </div>
          </CardHeader>
          <Separator />
          <div className="p-2">
            <div className="flex gap-1">
              <Input 
                placeholder="Channel..." 
                value={newChannel} 
                onChange={(e) => setNewChannel(e.target.value)} 
                className="h-7 text-xs" 
                onKeyDown={(e) => e.key === "Enter" && addSubscription()}
                disabled={!socketConnected || !activeConnectionId}
              />
              <Button 
                size="sm" 
                className="h-7" 
                onClick={addSubscription}
                disabled={!socketConnected || !activeConnectionId}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1 px-2">
            {subscriptions.length === 0 && (
              <div className="text-center text-muted-foreground text-xs py-4">
                No active subscriptions
              </div>
            )}
            {subscriptions.map(ch => (
              <div key={ch} className="flex items-center justify-between py-1.5 px-2 text-xs rounded hover:bg-accent group">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse-dot" />
                  <span className="font-mono">{ch}</span>
                </div>
                <Button
                  variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100"
                  onClick={() => removeSubscription(ch)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </ScrollArea>

          <Separator />
          <div className="p-2 space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase">Publish</p>
            <Input 
              placeholder="Channel" 
              value={publishChannel} 
              onChange={(e) => setPublishChannel(e.target.value)} 
              className="h-7 text-xs font-mono"
              disabled={!socketConnected || !activeConnectionId}
            />
            <div className="flex gap-1">
              <Input 
                placeholder="Message..." 
                value={publishMessage} 
                onChange={(e) => setPublishMessage(e.target.value)} 
                className="h-7 text-xs" 
                onKeyDown={(e) => e.key === "Enter" && handlePublish()}
                disabled={!socketConnected || !activeConnectionId}
              />
              <Button 
                size="sm" 
                className="h-7" 
                onClick={handlePublish}
                disabled={!socketConnected || !activeConnectionId}
              >
                <Send className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Messages feed */}
        <Card className="flex-1 flex flex-col">
          <CardHeader className="p-3 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                <CardTitle className="text-sm">Live Messages</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs">{messages.length} messages</Badge>
            </div>
          </CardHeader>
          <Separator />
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-2">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  No messages yet. Subscribe to channels to receive messages.
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className="border rounded-md p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant="secondary" className="text-[10px] font-mono">{msg.channel}</Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap bg-muted rounded p-2">{tryParseJSON(msg.message)}</pre>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
