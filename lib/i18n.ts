// Complete bilingual dictionary - Georgian FIRST, English second
export const translations = {
  ka: {
    // Navigation
    workspace: "სამუშაო სივრცე",
    settings: "პარამეტრები",
    memory: "მეხსიერება",
    pricing: "ფასები",
    onboarding: "გაცნობა",
    
    // Agent G
    agentG: "Agent G",
    agentGTitle: "თქვენი პერსონალური ასისტენტი",
    readyToAssist: "მზად არის დასახმარებლად",
    
    // Services (All 13)
    services: {
      agentG: "Agent G (Luxury)",
      avatarBuilder: "Avatar Builder",
      voiceLab: "Voice Lab",
      imageArchitect: "Image Architect",
      musicStudio: "Music Studio",
      videoCineLab: "Video Cine Lab",
      gameForge: "Game Forge",
      aiProduction: "AI Production",
      businessAgent: "Business Agent",
      promptBuilder: "Prompt Builder",
      imageGenerator: "Image Generator",
      videoGenerator: "Video Generator",
      textIntelligence: "Text Intelligence",
    },
    
    // Chat
    typeMessage: "შეიყვანეთ შეტყობინება...",
    send: "გაგზავნა",
    
    // Buttons
    getStarted: "დაწყება",
    viewDemo: "დემო ნახვა",
    backToWorkspace: "სამუშაო სივრცეში დაბრუნება",
    
    // Settings
    language: "ენა",
    georgian: "ქართული",
    english: "English",
    memorySettings: "მეხსიერების პარამეტრები",
    privacy: "კონფიდენციალურობა",
    replayOnboarding: "გაცნობის ხელახლა ჩვენება",
    
    // Pricing
    premiumPlan: "Agent G Premium",
    price: "2000 GEL / წელიწადი",
    unlocks: "გახსნის",
    
    // Errors
    notFound: "გვერდი ვერ მოიძებნა",
    returnToWorkspace: "სამუშაო სივრცეში დაბრუნება",
  },
  en: {
    // Navigation
    workspace: "Workspace",
    settings: "Settings",
    memory: "Memory",
    pricing: "Pricing",
    onboarding: "Onboarding",
    
    // Agent G
    agentG: "Agent G",
    agentGTitle: "Your Personal Assistant",
    readyToAssist: "Ready to assist",
    
    // Services (All 13)
    services: {
      agentG: "Agent G (Luxury)",
      avatarBuilder: "Avatar Builder",
      voiceLab: "Voice Lab",
      imageArchitect: "Image Architect",
      musicStudio: "Music Studio",
      videoCineLab: "Video Cine Lab",
      gameForge: "Game Forge",
      aiProduction: "AI Production",
      businessAgent: "Business Agent",
      promptBuilder: "Prompt Builder",
      imageGenerator: "Image Generator",
      videoGenerator: "Video Generator",
      textIntelligence: "Text Intelligence",
    },
    
    // Chat
    typeMessage: "Type your message...",
    send: "Send",
    
    // Buttons
    getStarted: "Get Started",
    viewDemo: "View Demo",
    backToWorkspace: "Return to Workspace",
    
    // Settings
    language: "Language",
    georgian: "Georgian",
    english: "English",
    memorySettings: "Memory Settings",
    privacy: "Privacy",
    replayOnboarding: "Replay Onboarding",
    
    // Pricing
    premiumPlan: "Agent G Premium",
    price: "2000 GEL / year",
    unlocks: "Unlocks",
    
    // Errors
    notFound: "Page Not Found",
    returnToWorkspace: "Return to Workspace",
  },
};

export type Language = "ka" | "en";
export type Translations = typeof translations;

export function getTranslation(lang: Language, key: string): string {
  const keys = key.split(".");
  let value: any = translations[lang];
  
  for (const k of keys) {
    if (value && typeof value === "object") {
      value = value[k];
    } else {
      return key; // Fallback to key if not found
    }
  }
  
  return typeof value === "string" ? value : key;
}
