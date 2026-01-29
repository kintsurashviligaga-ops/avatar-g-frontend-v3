'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Paperclip, Image as ImageIcon, Mic, X, Sparkles } from 'lucide-react';

// Service Configuration
interface Service {
  id: string;
  slug: string;
  geName: string;
  description: string;
  route: string;
  prompts: string[];
  emoji: string;
}

const services: Service[] = [
  {
    id: 'avatar-builder',
    slug: 'avatar-builder',
    geName: 'ავატარის შექმნა',
    description: 'პერსონალური AI ავატარი',
    route: '/avatar-builder',
    prompts: ['შემიქმენი ავატარი', 'გამიუმჯობესე ფოტო'],
    emoji: '🎭',
  },
  {
    id: 'voice-lab',
    slug: 'voice-lab',
    geName: 'ხმის ლაბორატორია',
    description: 'ხმის კლონირება',
    route: '/voice-lab',
    prompts: ['კლონირე ხმა', 'შეცვალე ტონი'],
    emoji: '🎤',
  },
  {
    id: 'image-architect',
    slug: 'image-architect',
    geName: 'სურათის დიზაინერი',
    description: 'პროფესიული დიზაინი',
    route: '/image-architect',
    prompts: ['შემიქმენი ლოგო', 'გაფორმე პოსტერი'],
    emoji: '🎨',
  },
  {
    id: 'music-studio',
    slug: 'music-studio',
    geName: 'მუსიკის სტუდია',
    description: 'AI მუსიკა',
    route: '/music-studio',
    prompts: ['შემიქმენი მელოდია', 'დაამატე ბასი'],
    emoji: '🎵',
  },
  {
    id: 'video-cine-lab',
    slug: 'video-cine-lab',
    geName: 'ვიდეო კინოლაბი',
    description: 'ვიდეო მონტაჟი',
    route: '/video-cine-lab',
    prompts: ['შემიქმენი სცენარი', 'დამიმონტაჟე'],
    emoji: '🎬',
  },
  {
    id: 'game-forge',
    slug: 'game-forge',
    geName: 'თამაშის ქარხანა',
    description: 'თამაშების დეველოპმენტი',
    route: '/game-forge',
    prompts: ['შემიქმენი პერსონაჟი', 'დაწერე კოდი'],
    emoji: '🎮',
  },
  {
    id: 'ai-production',
    slug: 'ai-production',
    geName: 'AI პროდაქშენი',
    description: 'მასობრივი წარმოება',
    route: '/ai-production',
    prompts: ['დამიგეგმე კამპანია', 'შექმენი კონტენტი'],
    emoji: '⚡',
  },
  {
    id: 'business-agent',
    slug: 'business-agent',
    geName: 'ბიზნეს აგენტი',
    description: 'ავტომატიზაცია',
    route: '/business-agent',
    prompts: ['განსაზღვრე KPI-ები', 'შექმენი სტრატეგია'],
    emoji: '💼',
  },
  {
    id: 'prompt-builder',
    slug: 'prompt-builder',
    geName: 'პრომპტის მექანიკა',
    description: 'პროფესიული პრომპტები',
    route: '/prompt-builder',
    prompts: ['გააუმჯობესე პრომპტი', 'შემიქმენი თემპლეიტი'],
    emoji: '📝',
  },
  {
    id: 'image-generator',
    slug: 'image-generator',
    geName: 'სურათის გენერაცია',
    description: 'AI სურათები',
    route: '/image-generator',
    prompts: ['შემიქმენი ილუსტრაცია', 'გენერირე ფოტო'],
    emoji: '🖼️',
  },
  {
    id: 'video-generator',
    slug: 'video-generator',
    geName: 'ვიდეო გენერაცია',
    description: 'AI ვიდეოები',
    route: '/video-generator',
    prompts: ['შემიქმენი ვიდეო', 'გენერირე ანიმაცია'],
    emoji: '📹',
  },
  {
    id: 'text-intelligence',
    slug: 'text-intelligence',
    geName: 'ტექსტის ანალიტიკა',
    description: 'ანალიზი და ოპტიმიზაცია',
    route: '/text-intelligence',
    prompts: ['გაანალიზე ტექსტი', 'შექმენი რეზიუმე'],
    emoji: '📊',
  },
];

const defaultQuickPrompts = [
  'დამიგეგმე კონტენტი',
  'გამიკეთე ბიზნეს-სტრატეგია',
  'შექმენი ვიდეო იდეა',
];

// Message Interface
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'file';
}

export default function HomePage() {
  const router = useRouter();
  const [selectedService, setSelectedService] = useState<string | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = selectedService
    ? services.find((s) => s.slug === selectedService)?.prompts || defaultQuickPrompts
    : defaultQuickPrompts;

  const currentService = selectedService ? services.find((s) => s.slug === selectedService) : null;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 100);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [inputValue]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim() && attachments.length === 0) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputValue('');
    setAttachments([]);
    setIsTyping(false);

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'გასაგებია. რით შემიძლია დაგეხმაროთ? 🤖',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);
    }, 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    setIsTyping(e.target.value.length > 0);
  };

  const addAttachment = (type: 'image' | 'file') => {
    const newAttachment: Attachment = {
      id: Date.now().toString(),
      name: type === 'image' ? `სურათი_${attachments.length + 1}.jpg` : `ფაილი_${attachments.length + 1}.pdf`,
      type,
    };
    setAttachments((prev) => [...prev, newAttachment]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleQuickPrompt = (prompt: string) => {
    setInputValue(prompt);
    textareaRef.current?.focus();
  };

  const handleServiceClick = (service: Service) => {
    router.push(service.route);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse at top, rgba(139, 92, 246, 0.15), transparent 50%), radial-gradient(ellipse at bottom, rgba(59, 130, 246, 0.1), transparent 50%), #07090D',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Animated Background Stars */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(2px 2px at 20% 30%, rgba(142, 197, 255, 0.3), transparent), radial-gradient(2px 2px at 60% 70%, rgba(142, 197, 255, 0.2), transparent), radial-gradient(1px 1px at 80% 10%, rgba(255, 255, 255, 0.2), transparent)',
          backgroundSize: '200px 200px, 250px 250px, 150px 150px',
          animation: 'stars 20s linear infinite',
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <header
        style={{
          padding: '16px 20px',
          background: 'rgba(10, 14, 20, 0.8)',
          backdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              ✨
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: '#EAF1FF', margin: 0 }}>Avatar G</h1>
              <p style={{ fontSize: 11, color: 'rgba(175, 192, 224, 0.7)', margin: 0 }}>Your AI Media Factory</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                padding: '6px 12px',
                background: 'rgba(74, 222, 128, 0.1)',
                border: '1px solid rgba(74, 222, 128, 0.3)',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#4ADE80',
                  animation: 'pulse 2s infinite',
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#4ADE80' }}>აქტიური</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px 80px' }}>
        {/* Chat Console */}
        <div style={{ marginBottom: 48 }}>
          <div
            style={{
              maxWidth: 800,
              margin: '0 auto',
              background: 'rgba(255, 255, 255, 0.06)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            }}
          >
            {/* Chat Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(142, 197, 255, 0.7)' }}>Avatar G Console</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} color="#8EC5FF" />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#EAF1FF' }}>
                  {currentService ? currentService.geName : 'აღმასრულებელი AI კონსოლი'}
                </span>
              </div>
            </div>

            {/* Messages Area */}
            <div style={{ position: 'relative', height: 320 }}>
              <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '20px' }}>
                {messages.length === 0 ? (
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                    <p style={{ color: 'rgba(175, 192, 224, 0.6)', fontSize: 14, textAlign: 'center' }}>
                      დაიწყეთ საუბარი Avatar G-თან ✨
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                      {quickPrompts.map((prompt, index) => (
                        <button
                          key={index}
                          onClick={() => handleQuickPrompt(prompt)}
                          style={{
                            padding: '8px 16px',
                            fontSize: 12,
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: 999,
                            color: '#AFC0E0',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                            e.currentTarget.style.borderColor = 'rgba(142, 197, 255, 0.3)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                          }}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        style={{
                          display: 'flex',
                          justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '85%',
                            padding: '12px 16px',
                            borderRadius: 16,
                            background: message.role === 'user' 
                              ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))'
                              : 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                          }}
                        >
                          <p style={{ color: '#EAF1FF', fontSize: 14, margin: 0, lineHeight: 1.5, wordBreak: 'break-word' }}>
                            {message.content}
                          </p>
                          <span style={{ color: 'rgba(107, 122, 153, 0.8)', fontSize: 10, marginTop: 4, display: 'block' }}>
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 12px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 8,
                      }}
                    >
                      <span style={{ color: '#AFC0E0', fontSize: 12, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {attachment.name}
                      </span>
                      <button
                        onClick={() => removeAttachment(attachment.id)}
                        style={{
                          padding: 2,
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <X size={12} color="#6B7A99" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Composer */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => addAttachment('file')}
                    style={{
                      padding: 8,
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    aria-label="ფაილის დამატება"
                  >
                    <Paperclip size={16} color="#AFC0E0" />
                  </button>
                  <button
                    onClick={() => addAttachment('image')}
                    style={{
                      padding: 8,
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    aria-label="სურათის დამატება"
                  >
                    <ImageIcon size={16} color="#AFC0E0" />
                  </button>
                  <button
                    style={{
                      padding: 8,
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    aria-label="ხმოვანი შეყვანა"
                  >
                    <Mic size={16} color="#AFC0E0" />
                  </button>
                </div>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="ჰკითხე Avatar G-ს ყველაფერი..."
                  rows={1}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 12,
                    color: '#EAF1FF',
                    fontSize: 14,
                    resize: 'none',
                    outline: 'none',
                    fontFamily: 'inherit',
                    minHeight: 40,
                    maxHeight: 100,
                  }}
                />

                {/* Send Button */}
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() && attachments.length === 0}
                  style={{
                    padding: 10,
                    background: inputValue.trim() || attachments.length > 0
                      ? 'linear-gradient(135deg, #8B5CF6, #3B82F6)'
                      : 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: 12,
                    cursor: inputValue.trim() || attachments.length > 0 ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: inputValue.trim() || attachments.length > 0 ? 1 : 0.4,
                    transition: 'all 0.2s',
                  }}
                  aria-label="გაგზავნა"
                >
                  <Send size={16} color="#fff" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Services Grid */}
        <div>
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#AFC0E0', margin: 0 }}>სერვისები</h2>
            <span style={{ fontSize: 12, color: '#6B7A99' }}>აირჩიე სერვისი →</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {services.map((service) => (
              <button
                key={service.id}
                onClick={() => handleServiceClick(service)}
                onMouseEnter={() => setSelectedService(service.slug)}
                style={{
                  padding: 20,
                  background: selectedService === service.slug
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(255, 255, 255, 0.06)',
                  backdropFilter: 'blur(24px)',
                  border: selectedService === service.slug
                    ? '1px solid rgba(142, 197, 255, 0.3)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 16,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.3s',
                  boxShadow: selectedService === service.slug
                    ? '0 8px 32px rgba(142, 197, 255, 0.2)'
                    : 'none',
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 12 }}>{service.emoji}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#EAF1FF', margin: '0 0 8px 0' }}>
                  {service.geName}
                </h3>
                <p style={{ fontSize: 13, color: '#6B7A99', margin: 0, lineHeight: 1.5 }}>
                  {service.description}
                </p>
                <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {service.prompts.slice(0, 2).map((prompt, idx) => (
                    <span
                      key={idx}
                      style={{
                        padding: '4px 8px',
                        fontSize: 10,
                        background: 'rgba(142, 197, 255, 0.1)',
                        border: '1px solid rgba(142, 197, 255, 0.2)',
                        borderRadius: 6,
                        color: '#8EC5FF',
                      }}
                    >
                      {prompt}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes stars {
          from { transform: translate(0, 0); }
          to { transform: translate(-50px, -50px); }
        }
      `}</style>
    </div>
  );
}
