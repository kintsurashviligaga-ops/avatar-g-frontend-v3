"use client";

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, Mic, MicOff, Bot, User, X, Minimize2, Maximize2,
  Paperclip, Image as ImageIcon, Sparkles, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIdentityStore } from '@/store/identity-store';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: string[];
}

export default function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { avatar, voice } = useIdentityStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: input }],
          model: 'gpt-4',
        }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'I apologize, but I cannot process your request at the moment.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Connection error. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    // STT implementation would go here
  };

  return (
    <>
      {/* Chat Toggle Button */}
      <motion.button
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 flex items-center justify-center cyan-glow"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="w-6 h-6 text-white" /> : <Bot className="w-6 h-6 text-white" />}
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className={`fixed right-6 z-40 glass-panel rounded-2xl overflow-hidden ${isMinimized ? 'bottom-24 w-80 h-14' : 'bottom-24 w-96 h-[600px]'}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-cyan-500/20 bg-black/40">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-400 to-purple-500 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Avatar G Assistant</h3>
                  <p className="text-xs text-cyan-400/70">Powered by GPT-4</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setIsMinimized(!isMinimized)} className="p-1 hover:bg-cyan-500/10 rounded">
                  {isMinimized ? <Maximize2 className="w-4 h-4 text-cyan-400" /> : <Minimize2 className="w-4 h-4 text-cyan-400" />}
                </button>
                <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-cyan-500/10 rounded">
                  <X className="w-4 h-4 text-cyan-400" />
                </button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 h-[420px]">
                  {messages.length === 0 && (
                    <div className="text-center text-cyan-400/50 py-8">
                      <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">How can I assist you today?</p>
                      <p className="text-xs mt-2">I can help with avatar creation, voice cloning, content generation, and more.</p>
                    </div>
                  )}
                  
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${message.role === 'user' ? 'bg-purple-500/20' : 'bg-cyan-500/20'}`}>
                        {message.role === 'user' ? <User className="w-4 h-4 text-purple-400" /> : <Bot className="w-4 h-4 text-cyan-400" />}
                      </div>
                      <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${message.role === 'user' ? 'bg-purple-500/20 text-white rounded-tr-sm' : 'bg-cyan-500/10 text-cyan-100 rounded-tl-sm'}`}>
                        {message.content}
                      </div>
                    </motion.div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div className="p-3 rounded-2xl bg-cyan-500/10 rounded-tl-sm">
                        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="p-4 border-t border-cyan-500/20 bg-black/40">
                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-cyan-500/10 rounded-lg text-cyan-400/70 hover:text-cyan-400">
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <button className="p-2 hover:bg-cyan-500/10 rounded-lg text-cyan-400/70 hover:text-cyan-400">
                      <ImageIcon className="w-5 h-5" />
                    </button>
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Type your message..."
                      className="flex-1 bg-black/30 border border-cyan-500/20 rounded-lg px-4 py-2 text-sm text-white placeholder-cyan-400/50 focus:outline-none focus:border-cyan-500/50"
                    />
                    <button
                      onClick={toggleRecording}
                      className={`p-2 rounded-lg ${isRecording ? 'bg-red-500/20 text-red-400' : 'hover:bg-cyan-500/10 text-cyan-400/70 hover:text-cyan-400'}`}
                    >
                      {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                    <button
                      onClick={sendMessage}
                      disabled={!input.trim() || isLoading}
                      className="p-2 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-white disabled:opacity-50"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
