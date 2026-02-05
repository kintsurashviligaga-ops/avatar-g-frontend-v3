"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { 
  MessageCircle, 
  X, 
  Send, 
  Mic, 
  MicOff, 
  Bot,
  User,
  Loader2,
  Volume2,
  VolumeX
} from "lucide-react";
import { useIdentity } from "@/lib/identity/IdentityContext";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  audioUrl?: string;
}

export default function GlobalChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { globalVoiceId } = useIdentity();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Call text generation API
      const response = await fetch('/api/generate/text', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          _identity: { avatarId: "chatbot", voiceId: globalVoiceId },
          type: "general"
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Generate voice if enabled and voice ID exists
        let audioUrl = undefined;
        if (autoSpeak && globalVoiceId) {
          const voiceResponse = await fetch('/api/generate/voice', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: data.text,
              _identity: { voiceId: globalVoiceId },
              emotion: "neutral"
            })
          });
          
          if (voiceResponse.ok) {
            const voiceData = await voiceResponse.json();
            audioUrl = voiceData.audioUrl;
            
            // Auto-play
            const audio = new Audio(audioUrl);
            audio.play();
          }
        }

        const assistantMessage: Message = {
          id: `msg-${Date.now() + 1}`,
          role: "assistant",
          content: data.text,
          timestamp: new Date().toISOString(),
          audioUrl
        };

        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    // In production: Implement Web Speech API or similar
    if (!isRecording) {
      setTimeout(() => {
        setIsRecording(false);
        sendMessage("Voice message simulated");
      }, 3000);
    }
  };

  const playAudio = (url: string) => {
    const audio = new Audio(url);
    audio.play();
  };

  return (
    <>
      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] shadow-lg shadow-[#00FFFF]/20 flex items-center justify-center"
      >
        {isOpen ? (
          <X className="w-6 h-6 text-black" />
        ) : (
          <MessageCircle className="w-6 h-6 text-black" />
        )}
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-24 right-6 z-50 w-96 h-[500px] bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-[#D4AF37]/20 to-[#00FFFF]/20 p-4 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#00FFFF] flex items-center justify-center">
                    <Bot className="w-6 h-6 text-black" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Avatar G Assistant</h3>
                    <p className="text-xs text-gray-400">Powered by GPT-4</p>
                  </div>
                </div>
                <button
                  onClick={() => setAutoSpeak(!autoSpeak)}
                  className={`p-2 rounded-lg transition-colors ${autoSpeak ? 'bg-[#00FFFF]/20 text-[#00FFFF]' : 'bg-white/5 text-gray-400'}`}
                  title={autoSpeak ? "Disable voice" : "Enable voice"}
                >
                  {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  <Bot className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>How can I help you today?</p>
                </div>
              )}
              
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.role === "user" ? "bg-[#D4AF37]/20" : "bg-[#00FFFF]/20"
                  }`}>
                    {message.role === "user" ? (
                      <User className="w-4 h-4 text-[#D4AF37]" />
                    ) : (
                      <Bot className="w-4 h-4 text-[#00FFFF]" />
                    )}
                  </div>
                  <div className={`max-w-[70%] rounded-2xl p-3 ${
                    message.role === "user" 
                      ? "bg-[#D4AF37]/20 text-white" 
                      : "bg-white/10 text-gray-200"
                  }`}>
                    <p className="text-sm">{message.content}</p>
                    {message.audioUrl && (
                      <button
                        onClick={() => playAudio(message.audioUrl!)}
                        className="mt-2 flex items-center gap-1 text-xs text-[#00FFFF] hover:underline"
                      >
                        <Volume2 className="w-3 h-3" />
                        Play voice
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
              
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#00FFFF]/20 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-[#00FFFF]" />
                  </div>
                  <div className="bg-white/10 rounded-2xl p-3">
                    <Loader2 className="w-5 h-5 animate-spin text-[#00FFFF]" />
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/10 bg-[#0A0A0A]">
              <div className="flex gap-2">
                <button
                  onClick={toggleRecording}
                  className={`p-3 rounded-xl transition-colors ${
                    isRecording 
                      ? "bg-red-500/20 text-red-500 animate-pulse" 
                      : "bg-white/5 text-gray-400 hover:bg-white/10"
                  }`}
                >
                  {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && sendMessage(input)}
                  placeholder="Type a message..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 text-white placeholder-gray-500 focus:border-[#00FFFF] focus:outline-none"
                />
                
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isLoading}
                  className="p-3 bg-gradient-to-r from-[#D4AF37] to-[#00FFFF] rounded-xl text-black disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
