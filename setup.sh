#!/bin/bash

echo "🚀 Avatar G Setup Starting..."

# 1. Install dependencies
npm install framer-motion zustand @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs @radix-ui/react-slider lucide-react clsx tailwind-merge class-variance-authority @radix-ui/react-progress

# 2. Create directories
mkdir -p lib components/ui app/services app/api/chat

echo "✅ Dependencies installed"
