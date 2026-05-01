'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isTextUIPart, type UIMessage, type FileUIPart } from 'ai';
import { Menu, Send, Square, RotateCcw, Paperclip, X } from 'lucide-react';
import MessageBubble from './MessageBubble';
import ChatSidebar from './ChatSidebar';
import {
  getConversations,
  getMessages,
  createSession,
  saveMessage,
  deleteSession,
  updateSessionTitle,
  type Conversation,
} from '@/lib/chat-history';

interface ChatInterfaceProps {
  locale?: string;
}

interface LocalFile {
  name: string;
  mediaType: string;
  dataUrl: string; // full data:mime;base64,... URL
}

const SUGGESTION_CHIPS = [
  '◉ AvATAR შექმენი',
  '✦ სურათი გამიკეთე',
  '▶ ვიდეოს კონცეფცია',
  '>_ კოდი დამიწერე',
];

function getMessageText(msg: UIMessage): string {
  return msg.parts.filter(isTextUIPart).map((p) => p.text).join('');
}

export default function ChatInterface({ locale: _locale = 'ka' }: ChatInterfaceProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSessionRef = useRef<string | null>(null);
  activeSessionRef.current = activeSessionId;

  const { messages, sendMessage, regenerate, stop, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat/gemini' }),
    onFinish: ({ message, messages: allMessages }) => {
      const sessionId = activeSessionRef.current;
      if (!sessionId) return;
      const text = getMessageText(message);
      if (text) {
        void saveMessage(sessionId, 'assistant', text);
      }
      const firstUser = allMessages.find((m) => m.role === 'user');
      if (firstUser) {
        const title = getMessageText(firstUser).slice(0, 60);
        void updateSessionTitle(sessionId, title);
        setConversations((prev) =>
          prev.map((c) =>
            c.session_id === sessionId
              ? { ...c, title, updated_at: new Date().toISOString() }
              : c
          )
        );
      }
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  useEffect(() => {
    void getConversations('anonymous').then(setConversations);
  }, []);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setActiveSessionId(null);
    setLocalFiles([]);
    setInput('');
    setSidebarOpen(false);
  }, [setMessages]);

  const handleSelectConversation = useCallback(
    async (sessionId: string) => {
      setActiveSessionId(sessionId);
      setSidebarOpen(false);
      const msgs = await getMessages(sessionId);
      const uiMessages: UIMessage[] = msgs
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          parts: [{ type: 'text' as const, text: m.content }],
          metadata: undefined,
        }));
      setMessages(uiMessages);
    },
    [setMessages]
  );

  const handleDeleteConversation = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
      setConversations((prev) => prev.filter((c) => c.session_id !== sessionId));
      if (activeSessionId === sessionId) {
        setMessages([]);
        setActiveSessionId(null);
      }
    },
    [activeSessionId, setMessages]
  );

  const handleAddFiles = useCallback(async (rawFiles: File[]) => {
    const results: LocalFile[] = await Promise.all(
      rawFiles.map(
        (file) =>
          new Promise<LocalFile>((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                name: file.name,
                mediaType: file.type || 'application/octet-stream',
                dataUrl: reader.result as string,
              });
            reader.readAsDataURL(file);
          })
      )
    );
    setLocalFiles((prev) => [...prev, ...results]);
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setLocalFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const doSend = useCallback(async () => {
    const text = input.trim();
    if (!text && localFiles.length === 0) return;
    if (isLoading) return;

    // Create Supabase session on first message
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = await createSession('anonymous', 'agent-g', text.slice(0, 60) || 'ახალი ჩატი');
      if (sessionId) {
        setActiveSessionId(sessionId);
        setConversations((prev) => [
          {
            session_id: sessionId!,
            title: text.slice(0, 60) || 'ახალი ჩატი',
            updated_at: new Date().toISOString(),
            agent_id: 'agent-g',
          },
          ...prev,
        ]);
      }
    }
    if (sessionId && text) {
      void saveMessage(sessionId, 'user', text);
    }

    // Convert local files to FileUIPart[] (data URLs — SDK handles base64 extraction)
    const fileParts: FileUIPart[] = localFiles.map((f) => ({
      type: 'file' as const,
      mediaType: f.mediaType,
      filename: f.name,
      url: f.dataUrl,
    }));

    setInput('');
    setLocalFiles([]);

    // Single-argument sendMessage — files go inside the message
    if (fileParts.length > 0) {
      sendMessage({ text: text || ' ', files: fileParts });
    } else {
      sendMessage({ text });
    }
  }, [input, localFiles, isLoading, activeSessionId, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void doSend();
      }
      if (e.key === 'Escape' && isLoading) stop();
    },
    [doSend, isLoading, stop]
  );

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInput(suggestion + ' ');
    textareaRef.current?.focus();
  }, []);

  const isEmpty = messages.length === 0;
  const lastMessage = messages[messages.length - 1];
  const showRegenerate = !isLoading && lastMessage?.role === 'assistant' && messages.length > 0;

  return (
    <div className="flex h-screen bg-[#050b18] overflow-hidden">
      <ChatSidebar
        conversations={conversations}
        activeId={activeSessionId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#070d1e]/80 backdrop-blur-sm shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center shrink-0">
              <span className="text-cyan-400 text-xs font-bold">G</span>
            </div>
            <div>
              <p className="text-white/90 text-sm font-semibold leading-none">Agent G</p>
              <p className="text-white/40 text-[10px] mt-0.5">Claude Opus · MyAvatar.ge</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-amber-400' : 'bg-cyan-400'} animate-pulse`} />
            <span className="text-white/40 text-xs">{isLoading ? 'ფიქრობს...' : 'Online'}</span>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full px-4 py-8">
              <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center mb-4">
                <span className="text-cyan-400 text-2xl font-bold">G</span>
              </div>
              <h2 className="text-white/90 text-xl font-semibold mb-2">გამარჯობა! მე ვარ Agent G</h2>
              <p className="text-white/50 text-sm text-center max-w-sm mb-8">
                MyAvatar.ge-ის AI ასისტენტი — სურათების, ვიდეოს, ავატარების შექმნა და სხვა
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleSuggestionClick(chip)}
                    className="px-4 py-2 rounded-full bg-white/[0.05] border border-white/10 text-white/60 hover:text-white/90 hover:bg-white/[0.09] hover:border-cyan-400/20 text-sm transition-all"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-6 space-y-1">
              {messages.map((msg, idx) => {
                const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1;
                return (
                  <MessageBubble
                    key={msg.id}
                    message={{ id: msg.id, role: msg.role as 'user' | 'assistant', content: getMessageText(msg) }}
                    isStreaming={isLastAssistant && isLoading}
                  />
                );
              })}

              {/* Thinking dots — before first assistant token */}
              {isLoading && lastMessage?.role === 'user' && (
                <div className="flex gap-3 px-4 mb-2">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center mt-0.5">
                    <span className="text-cyan-400 text-xs font-bold">G</span>
                  </div>
                  <div className="flex items-center gap-1 pt-1.5">
                    <span className="text-white/40 text-sm">ფიქრობს</span>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1 h-1 rounded-full bg-cyan-400/60 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Regenerate */}
        {showRegenerate && (
          <div className="flex justify-center pb-2 shrink-0">
            <button
              onClick={() => void regenerate()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-white/50 hover:text-white/80 hover:bg-white/[0.07] text-xs transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              გადაგენერირება
            </button>
          </div>
        )}

        {/* Input area */}
        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] shrink-0">
          {/* File previews */}
          {localFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {localFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/10 text-xs text-white/60"
                >
                  <span className="truncate max-w-[120px]">{f.name}</span>
                  <button
                    onClick={() => handleRemoveFile(i)}
                    className="text-white/30 hover:text-white/70 transition-colors ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 bg-white/[0.04] border border-white/10 rounded-2xl px-3 py-2 focus-within:border-cyan-400/20 focus-within:bg-white/[0.06] transition-colors">
            <button
              type="button"
              onClick={() => {
                const picker = document.createElement('input');
                picker.type = 'file';
                picker.multiple = true;
                picker.accept = 'image/*,application/pdf,.doc,.docx,.txt';
                picker.onchange = (e) => {
                  const files = (e.target as HTMLInputElement).files;
                  if (files) void handleAddFiles(Array.from(files));
                };
                picker.click();
              }}
              className="shrink-0 p-1.5 mb-0.5 rounded-lg text-white/40 hover:text-cyan-400 hover:bg-white/[0.05] transition-colors relative"
              title="ფაილის დამატება"
            >
              <Paperclip className="w-4 h-4" />
              {localFiles.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-cyan-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                  {localFiles.length}
                </span>
              )}
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="შეიყვანეთ შეტყობინება..."
              rows={1}
              className="flex-1 bg-transparent text-white/90 placeholder-white/30 text-sm resize-none outline-none leading-relaxed py-1 min-h-[28px] max-h-[180px] overflow-y-auto"
              style={{ scrollbarWidth: 'none' }}
            />

            {isLoading ? (
              <button
                type="button"
                onClick={() => stop()}
                className="shrink-0 p-2 mb-0.5 rounded-xl bg-red-500/20 border border-red-400/30 text-red-400 hover:bg-red-500/30 transition-colors"
                title="გაჩერება"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void doSend()}
                disabled={!input.trim() && localFiles.length === 0}
                className="shrink-0 p-2 mb-0.5 rounded-xl bg-cyan-500/20 border border-cyan-400/30 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="გაგზავნა"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>

          <p className="text-white/20 text-[10px] text-center mt-2">
            AI პასუხები შეიძლება შეცდომები შეიცავდეს · Shift+Enter ახალი სტრიქონისთვის
          </p>
        </div>
      </div>
    </div>
  );
}
