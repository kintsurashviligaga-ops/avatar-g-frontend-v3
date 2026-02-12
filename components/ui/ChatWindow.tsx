"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Paperclip, Settings, Maximize2, Minimize2, X, Loader2 } from "lucide-react";
import { Button } from "./button";
import { Card } from "./card";

export type ServiceContext = "global" | "music" | "video" | "avatar" | "voice" | "business";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isError?: boolean;
}

interface ChatWindowProps {
  title?: string;
  serviceContext?: ServiceContext;
  onSendMessage?: (message: string, context: ServiceContext) => Promise<void>;
  isLoading?: boolean;
  onSettingsClick?: () => void;
  minimizable?: boolean;
  collapsible?: boolean;
  height?: "sm" | "md" | "lg" | "full";
}

const contextConfig = {
  global: {
    title: "Avatar G Assistant",
    color: "from-cyan-500 to-blue-500",
    bgColor: "bg-cyan-500/5",
  },
  music: {
    title: "Music Studio Assistant",
    color: "from-green-500 to-emerald-500",
    bgColor: "bg-green-500/5",
  },
  video: {
    title: "Video Studio Assistant",
    color: "from-red-500 to-orange-500",
    bgColor: "bg-red-500/5",
  },
  avatar: {
    title: "Avatar Builder Assistant",
    color: "from-cyan-400 to-blue-500",
    bgColor: "bg-cyan-500/5",
  },
  voice: {
    title: "Voice Lab Assistant",
    color: "from-purple-500 to-pink-500",
    bgColor: "bg-purple-500/5",
  },
  business: {
    title: "Business Agent",
    color: "from-amber-500 to-orange-500",
    bgColor: "bg-amber-500/5",
  },
};

const heightMap = {
  sm: "h-64",
  md: "h-96",
  lg: "h-[600px]",
  full: "h-screen",
};

export function ChatWindow({
  title,
  serviceContext = "global",
  onSendMessage,
  isLoading = false,
  onSettingsClick,
  minimizable = true,
  collapsible = true,
  height = "md",
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init",
      role: "assistant",
      content: `Hello! I'm your ${contextConfig[serviceContext].title.toLowerCase()}. How can I help you create something amazing today?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle message send
  const handleSend = useCallback(async () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = {
      id: Math.random().toString(36),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    if (onSendMessage) {
      try {
        await onSendMessage(input, serviceContext);

        // In real implementation, this would be replaced by streaming response
        const assistantMessage: ChatMessage = {
          id: Math.random().toString(36),
          role: "assistant",
          content: "I've processed your request. Response will appear here.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        const errorMessage: ChatMessage = {
          id: Math.random().toString(36),
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          timestamp: new Date(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    }
  }, [input, serviceContext, onSendMessage]);

  const config = contextConfig[serviceContext];
  const heightClass = isExpanded ? "h-screen" : heightMap[height];

  return (
    <motion.div
      className={`flex flex-col rounded-lg border border-gray-700 overflow-hidden transition-all duration-300 ${config.bgColor} ${
        isMinimized ? "h-12" : heightClass
      }`}
      layout
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 bg-gradient-to-r ${config.color} text-white cursor-pointer`}
        onClick={() => collapsible && setIsMinimized(!isMinimized)}
      >
        <h3 className="font-semibold text-sm">{title || config.title}</h3>
        <div className="flex items-center gap-2">
          {onSettingsClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSettingsClick();
              }}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
          {minimizable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(!isMinimized);
              }}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-1 hover:bg-white/10 rounded transition-colors"
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Messages area */}
      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/50"
          >
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg text-sm ${
                    msg.role === "user"
                      ? `bg-gradient-to-r ${config.color} text-white`
                      : msg.isError
                        ? "bg-red-500/20 text-red-300 border border-red-500/30"
                        : "bg-slate-800 text-gray-100"
                  }`}
                >
                  {msg.content}
                </div>
              </motion.div>
            ))}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-gray-400"
              >
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      {!isMinimized && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="border-t border-gray-700 p-3 bg-slate-900"
        >
          <div className="flex gap-2 items-end">
            <button className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
              <Paperclip className="w-4 h-4 text-gray-400" />
            </button>
            <input
              ref={inputRef}
              type="text"
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              disabled={isLoading}
              className="flex-1 bg-gray-800 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm outline-none border border-gray-700 focus:border-cyan-500/50 transition-colors"
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white p-2 rounded-lg"
              size="sm"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
