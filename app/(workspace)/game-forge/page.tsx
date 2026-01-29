00:06:39.876 
00:06:39.876 
Import trace for requested module:
00:06:39.876 
./app/(workspace)/video-cine-lab/page.tsx
00:06:39.876 
00:06:39.876 
./app/page.tsx
00:06:39.876 
Error: 
00:06:39.876 
  x Unexpected token `div`. Expected jsx identifier
00:06:39.877 
    ,-[/vercel/path0/app/page.tsx:81:1]
00:06:39.877 
 81 |   if (!mounted) return <div className="min-h-screen bg-black" />;
00:06:39.877 
 82 | 
00:06:39.877 
 83 |   return (
00:06:39.877 
 84 |     <div className="relative min-h-screen bg-black text-white overflow-x-hidden">
00:06:39.877 
    :      ^^^
00:06:39.877 
 85 |       <Navigation activeSection={activeSection} onNavigate={scrollToSection} soundEnabled={soundEnabled} onToggleSound={() => setSoundEnabled((prev) => !prev)} />
00:06:39.877 
 86 |       <div className="fixed inset-0 z-0"><SpaceBackground /></div>
00:06:39.877 
 87 |       <main className="relative z-10">
00:06:39.877 
    `----
00:06:39.877 
00:06:39.877 
Caused by:
00:06:39.877 
    Syntax Error
00:06:39.877 
00:06:39.877 
Import trace for requested module:
00:06:39.878 
./app/page.tsx
00:06:39.878 
00:06:39.942 
00:06:39.942 
> Build failed because of webpack errors
00:06:39.943 
Error: Command "npm run build" exited with 1
Deployment Summary
Deployment Checks
Assigning Custom Domains
Runtime Logs

View and debug runtime logs & errors

Observability

Monitor app health & performance

Speed Insights

Not Enabled
Performance metrics from real users

Web Analytics

Not Enabled
Analyze visitors & traffic in real-time

Home
Docs
Knowledge Base
Academy
Help
Contact
Loading status…

Select a display theme:

system

light

dark
avatar-g-frontend-v3 – Deployment Overview
