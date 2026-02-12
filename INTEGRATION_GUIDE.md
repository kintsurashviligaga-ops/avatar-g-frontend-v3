# Integration Guide: ChatWindow & PromptBuilder in Service Pages

## Quick Start

### 1️⃣ Avatar Builder Integration

**File:** `app/services/avatar-builder/page.tsx`

```tsx
"use client";

import { useState } from "react";
import { ChatWindow } from "@/components/ui/ChatWindow";
import { PromptBuilder } from "@/components/ui/PromptBuilder";
import { FaceInput } from "@/components/ui/FaceInput";

export default function AvatarBuilder() {
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const handleSendChat = async (message: string) => {
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        context: "avatar",
      }),
    });
  };

  const handleApplyPrompt = (prompt: string) => {
    // Send prompt to chat or process directly
    handleSendChat(prompt);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_400px] gap-6 p-6">
      {/* Main Content */}
      <div>
        <h1>Avatar Builder</h1>
        
        {/* Camera Capture */}
        <FaceInput
          onCapture={(base64) => {
            setCapturedImage(base64);
            // Upload to Supabase Storage
          }}
          onSkip={() => {
            // Proceed without camera
          }}
        />
      </div>

      {/* Right Sidebar: Chat + Prompt Builder */}
      <div className="space-y-6">
        <PromptBuilder
          serviceType="avatar"
          onApplyPrompt={handleApplyPrompt}
        />
        
        <ChatWindow
          title="Avatar Assistant"
          serviceContext="avatar"
          onSendMessage={handleSendChat}
          minimizable
          collapsible
          height="sm"
        />
      </div>
    </div>
  );
}
```

---

### 2️⃣ Music Studio Integration

**File:** `app/services/music-studio/page.tsx`

```tsx
"use client";

import { useState } from "react";
import { ChatWindow } from "@/components/ui/ChatWindow";
import { PromptBuilder } from "@/components/ui/PromptBuilder";

export default function MusicStudio() {
  const handleSendChat = async (message: string) => {
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        context: "music",
      }),
    });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_380px] gap-6 p-6">
      {/* Main Production Area */}
      <div>
        <h1>Music Generation Studio</h1>
        {/* Your music editor/visualizer here */}
      </div>

      {/* Right Sidebar */}
      <div className="space-y-4 max-h-screen overflow-y-auto">
        <PromptBuilder
          serviceType="music"
          onApplyPrompt={(prompt) => {
            // Apply to music generation form
          }}
        />
        
        <ChatWindow
          title="Music Assistant"
          serviceContext="music"
          onSendMessage={handleSendChat}
          height="md"
          collapsible
        />
      </div>
    </div>
  );
}
```

---

### 3️⃣ Video Studio Integration

**File:** `app/services/media-production/page.tsx`

```tsx
"use client";

import { useState } from "react";
import { ChatWindow } from "@/components/ui/ChatWindow";
import { PromptBuilder } from "@/components/ui/PromptBuilder";

export default function VideoStudio() {
  const handleSendChat = async (message: string) => {
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        context: "video",
      }),
    });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_380px] gap-6 p-6">
      {/* Video Editor */}
      <div>
        <h1>Video Generation & Editing</h1>
        {/* Your video editor here */}
      </div>

      {/* Right Sidebar: Chat + Templates */}
      <div className="space-y-4 max-h-screen overflow-y-auto">
        <PromptBuilder
          serviceType="video"
          onApplyPrompt={(prompt) => {
            // Apply to video generation
          }}
        />
        
        <ChatWindow
          title="Video Assistant"
          serviceContext="video"
          onSendMessage={handleSendChat}
          height="lg"
          collapsible
        />
      </div>
    </div>
  );
}
```

---

## Design System Usage

### Apply to ALL Pages

#### 1. Update Page Layout
```tsx
import { PageContainer, SectionHeader } from "@/components/shared/DesignSystem";

export default function ServicePage() {
  return (
    <PageContainer maxWidth="2xl">
      <SectionHeader
        title="Your Service"
        subtitle="Description of the service"
        gradient="cyan"
        icon={<YourIcon />}
      />
      
      {/* Page content */}
    </PageContainer>
  );
}
```

#### 2. Feature Cards
```tsx
import { FeatureCard } from "@/components/shared/DesignSystem";

<FeatureCard
  icon={<Icon />}
  title="Feature Name"
  description="Feature description"
  status="ready"
  gradient="from-cyan-500 to-blue-500"
  onClick={() => {}}
/>
```

#### 3. Progress Tracking
```tsx
import { ProgressIndicator } from "@/components/shared/DesignSystem";

<ProgressIndicator
  stages={[
    { label: "Upload", completed: true },
    { label: "Process", completed: false, current: true },
    { label: "Download", completed: false },
  ]}
  orientation="horizontal"
/>
```

---

## API Route Patterns

### Using the Chat API

```typescript
// Basic chat
const response = await fetch("/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${userToken}`,
  },
  body: JSON.stringify({
    message: "Create a pop song about space exploration",
    context: "music",
    conversationId: "conv_123456",
  }),
});

const data = await response.json();
// {
//   response: "I'll help you create a pop song...",
//   provider: "OpenAI GPT-4",
//   context: "music",
//   conversationId: "conv_123456"
// }
```

---

## Styling Guide

### Color Consistency

```tsx
// Use these gradients across all components

const contextColors = {
  global: "from-cyan-500 to-blue-500",    // 🔵 Default
  music: "from-green-500 to-emerald-500",  // 🟢 Music
  video: "from-red-500 to-orange-500",     // 🔴 Video
  avatar: "from-cyan-400 to-blue-500",     // 🔵 Avatar
  voice: "from-purple-500 to-pink-500",    // 🟣 Voice
  business: "from-amber-500 to-orange-500", // 🟠 Admin
};
```

### Responsive Spacing

```tsx
// Use consistent padding & margins

// Mobile first
<div className="px-4 py-6 sm:px-6 md:px-8 lg:px-12">
  {/* Content */}
</div>

// Or use PageContainer
<PageContainer maxWidth="2xl">
  {/* Automatically handles responsive spacing */}
</PageContainer>
```

---

## Error Handling

### Chat Error States

```tsx
const [error, setError] = useState<string | null>(null);

const handleSendChat = async (message: string) => {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, context: "avatar" }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        setError("Too many requests. Please wait.");
      } else if (response.status === 401) {
        setError("Please log in to use chat.");
      } else {
        setError("Chat service error. Please try again.");
      }
      return;
    }

    const data = await response.json();
    // Handle success
  } catch (err) {
    setError("Network error. Please check your connection.");
  }
};
```

---

## Mobile Responsive Tips

### ChatWindow on Mobile
```tsx
// Always stack vertically on mobile
<div className="grid lg:grid-cols-[1fr_400px] gap-4">
  <div>{/* Main content */}</div>
  <div className="row-start-2 lg:row-start-auto">
    {/* ChatWindow - moves below on mobile */}
    <ChatWindow 
      height="sm"  // Smaller on mobile
      collapsible   // Allow collapse
    />
  </div>
</div>
```

### PromptBuilder on Mobile
```tsx
// Use collapsible state
const [expanded, setExpanded] = useState(false);

<motion.div
  initial={false}
  animate={{ height: expanded ? "auto" : "52px" }}
>
  <PromptBuilder serviceType="music" />
</motion.div>
```

---

## Testing Integration

```typescript
// Test that chat sends correct context
test("sends music context to API", async () => {
  const { getByText } = render(
    <ChatWindow serviceContext="music" />
  );
  
  // Type and send message
  fireEvent.click(getByText("Send"));
  
  // Verify API was called with music context
  expect(fetch).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      body: expect.stringContaining('"context":"music"'),
    })
  );
});

// Test prompt builder generates correct template
test("applies prompt correctly", async () => {
  const mockApply = jest.fn();
  render(
    <PromptBuilder 
      serviceType="music"
      onApplyPrompt={mockApply}
    />
  );
  
  // Select template
  fireEvent.click(getByText("Pop Song Generator"));
  
  // Fill variables and generate
  fireEvent.click(getByText("Generate Prompt"));
  fireEvent.click(getByText("Apply"));
  
  // Verify callback was called
  expect(mockApply).toHaveBeenCalledWith(
    expect.stringContaining("pop song")
  );
});
```

---

## Performance Optimization

### ChatWindow
```tsx
// Use memo to prevent unnecessary re-renders
import { memo } from "react";

const ChatWindow = memo(({ serviceContext, onSendMessage }) => {
  // Component code
});

export default ChatWindow;
```

### Lazy Load Components
```tsx
import dynamic from "next/dynamic";

const ChatWindow = dynamic(() => import("@/components/ui/ChatWindow"), {
  loading: () => <div>Loading chat...</div>,
  ssr: false, // Client-side only
});

// Use in page
<ChatWindow serviceContext="music" />
```

---

## Accessibility

### ChatWindow ARIA
```tsx
<div
  role="region"
  aria-label="Chat assistant"
  aria-live="polite"
  aria-atomic="false"
>
  {/* Messages */}
</div>
```

### PromptBuilder ARIA
```tsx
<button
  aria-expanded={isExpanded}
  aria-controls="prompt-content"
>
  Toggle Prompt Builder
</button>
```

---

## Next Steps

1. ✅ Cherry-pick integration code from above
2. ✅ Test each service page with new components
3. ✅ Apply Design System to all pages
4. ✅ Run full QA checklist
5. ✅ Deploy to production

---

**Questions?** Check `/api/chat?` endpoint for status and service list.
