# 🚀 QUICK REFERENCE - Avatar G Phase 3 Components

## 🎯 5-Second Overview

**Phase 3 delivered:** ChatWindow, PromptBuilder, DesignSystem, responsive landing page, unified Chat API

**Status:** ✅ Production ready, 0 critical errors, full documentation

---

## 📦 COMPONENT QUICK START

### ChatWindow
```tsx
import { ChatWindow } from "@/components/ui/ChatWindow";

<ChatWindow
  serviceContext="music"  // global|music|video|avatar|voice|business
  title="Music Assistant"
  height="md"             // sm|md|lg|full
  minimizable
  collapsible
  onSendMessage={async (msg, ctx) => {
    await fetch("/api/chat", { /* ... */ })
  }}
/>
```

### PromptBuilder
```tsx
import { PromptBuilder } from "@/components/ui/PromptBuilder";

<PromptBuilder
  serviceType="music"     // music|video|avatar|voice
  onApplyPrompt={(prompt) => sendToChat(prompt)}
  onSavePrompt={(template) => saveToDb(template)}
/>
```

### Design System
```tsx
import { 
  PageContainer, 
  SectionHeader, 
  FeatureCard,
  ProgressIndicator,
  GradientButton,
  AnimatedBackground,
  ServiceLayout,
  StatusBadge
} from "@/components/shared/DesignSystem";

<PageContainer maxWidth="2xl">
  <SectionHeader
    title="My Service"
    subtitle="Description"
    gradient="cyan"
    icon={<Icon />}
  />
  
  <ServiceLayout columns={3} gap="md">
    <FeatureCard
      icon={<Icon />}
      title="Feature"
      description="Desc"
      status="ready"
    />
  </ServiceLayout>
  
  <ProgressIndicator
    stages={[
      { label: "Step 1", completed: true },
      { label: "Step 2", current: true },
      { label: "Step 3", completed: false }
    ]}
  />
</PageContainer>
```

### FaceInput
```tsx
import { FaceInput } from "@/components/ui/FaceInput";

<FaceInput
  onCapture={(base64) => {
    // Upload to Supabase Storage
  }}
  onSkip={() => proceedWithoutCamera()}
/>
```

### RocketLogo
```tsx
import { RocketLogo } from "@/components/ui/RocketLogo";

<RocketLogo 
  size="lg"        // sm|md|lg
  animated         // true|false
  glow             // true|false
/>
```

---

## 🔌 API ROUTES

### Chat API
```bash
POST /api/chat
Content-Type: application/json
Authorization: Bearer {token}

{
  "message": "Create a pop song",
  "context": "music",
  "conversationId": "conv_123"
}

Response: { response, provider, context, conversationId }
```

### Service Contexts
- `global` - General AI assistant (cyan/blue)
- `music` - Music generation (green/emerald)
- `video` - Video generation (red/orange)
- `avatar` - Avatar builder (cyan/blue)
- `voice` - Voice synthesis (purple/pink)
- `business` - Admin features (amber/orange)

---

## 🎨 DESIGN TOKENS

### Gradients by Service
```
global:   from-cyan-500 to-blue-500
music:    from-green-500 to-emerald-500
video:    from-red-500 to-orange-500
avatar:   from-cyan-400 to-blue-500
voice:    from-purple-500 to-pink-500
business: from-amber-500 to-orange-500
```

### Font Sizes (Responsive)
```tsx
// Use clamp() for responsive sizing
fontSize: 'clamp(1rem, 2.5vw, 1.875rem)'

// Page Container padding
px-4 sm:px-6 lg:px-8
```

### Spacing
- Mobile: `px-4 py-6`
- Tablet: `px-6 py-8`
- Desktop: `px-8 py-12`

---

## 📋 INTEGRATION CHECKLIST

### Per Service Page
- [ ] Import ChatWindow
- [ ] Import PromptBuilder
- [ ] Import FaceInput (if needed)
- [ ] Apply DesignSystem to layout
- [ ] Add chat handler function
- [ ] Test API connection
- [ ] Test mobile responsive
- [ ] Deploy and monitor

### Template Structure
```tsx
"use client";
import { ChatWindow } from "@/components/ui/ChatWindow";
import { PromptBuilder } from "@/components/ui/PromptBuilder";
import { PageContainer, SectionHeader } from "@/components/shared/DesignSystem";

export default function ServicePage() {
  const handleChat = async (msg, ctx) => {
    await fetch("/api/chat", { /* ... */ })
  };

  return (
    <PageContainer>
      <SectionHeader title="My Service" gradient="cyan" />
      
      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        {/* Main content */}
        <div>{/* Edit area */}</div>
        
        {/* Sidebar: Chat + Prompts */}
        <div className="space-y-4">
          <PromptBuilder serviceType="music" />
          <ChatWindow 
            serviceContext="music"
            onSendMessage={handleChat}
          />
        </div>
      </div>
    </PageContainer>
  );
}
```

---

## 🔐 SECURITY REMINDERS

✅ **Do:**
- Always use bearer tokens in Authorization header
- Validate input on server-side
- Use environment variables for API keys
- Sanitize error messages

❌ **Don't:**
- Pass API keys in URLs
- Log sensitive data
- Trust client-side validation alone
- Expose provider details in errors

---

## 📊 FILE SIZES

| Component | Lines | Size |
|-----------|-------|------|
| ChatWindow.tsx | 276 | ~12KB |
| PromptBuilder.tsx | 358 | ~15KB |
| DesignSystem.tsx | 420 | ~18KB |
| FaceInput.tsx | 400 | ~16KB |
| RocketLogo.tsx | 500 | ~20KB |
| **Total** | **1,954** | **~81KB** |

---

## 🐛 COMMON ISSUES

### Chat API returns 401
- Check Authorization header
- Verify bearer token format: `Bearer {token}`
- Confirm user is authenticated

### PromptBuilder not showing templates
- Check serviceType prop is valid (music|video|avatar|voice)
- Verify templates array is not empty
- Check browser console for errors

### FaceInput camera permission denied
- Check browser HTTPS (required for camera)
- Verify camera permissions in OS
- Fallback to file upload should trigger

### ChatWindow not scrolling
- Ensure parent container has `max-h-screen overflow-y-auto`
- Check z-index conflicts
- Verify messagesEndRef is properly connected

---

## 📞 SUPPORT

### Documentation
- `PHASE_3_COMPONENTS_COMPLETE.md` - Full reference
- `INTEGRATION_GUIDE.md` - Step-by-step instructions
- `MASTER_CHECKLIST.md` - Full checklist

### Key Files
- ChatWindow: `components/ui/ChatWindow.tsx`
- API: `app/api/chat/route.ts`
- Middleware: `middleware.ts`
- Landing: `app/page.tsx`

### Next Phase
See `MASTER_CHECKLIST.md` for Phase 4+ roadmap

---

## ⚡ TL;DR

1. **ChatWindow** → Add to service sidebars, works out of box
2. **PromptBuilder** → Add to service sidebars, provides templates
3. **DesignSystem** → Use PageContainer, SectionHeader everywhere
4. **API** → POST /api/chat with context routing
5. **Landing** → Already responsive, no changes needed

**Compile:** `npm run build` - ✅ Passes  
**Deploy:** Ready for production ✅

---

**Happy building! 🚀**
