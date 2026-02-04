export type Language = "ka" | "en";

// Translation dictionary
const translations = {
  // Common
  "common.back": {
    ka: "უკან",
    en: "Back",
  },
  "common.active": {
    ka: "აქტიური",
    en: "Active",
  },
  "common.loading": {
    ka: "იტვირთება...",
    en: "Loading...",
  },

  // Workspace
  "workspace.title": {
    ka: "სამუშაო არე",
    en: "Workspace",
  },
  "workspace.online": {
    ka: "ონლაინ",
    en: "Online",
  },
  "workspace.offline": {
    ka: "ოფლაინ",
    en: "Offline",
  },
  "workspace.agentLabelKa": {
    ka: "Agent G",
    en: "Agent G",
  },
  "workspace.agentLabelEn": {
    ka: "Agent G",
    en: "Agent G",
  },
  "workspace.welcomeTitle": {
    ka: "გამარჯობა, Avatar G-ზე",
    en: "Welcome to Avatar G",
  },
  "workspace.welcomeSubtitle": {
    ka: "აირჩიე სერვისი ზემოდან ან დაწერე შენი მოთხოვნა",
    en: "Choose a service above or type your request",
  },
  "workspace.primaryCTA": {
    ka: "დაიწყე შექმნა",
    en: "Start Creating",
  },
  "workspace.secondaryCTA": {
    ka: "გაიგე მეტი",
    en: "Learn More",
  },
  "workspace.inputPlaceholder": {
    ka: "დაწერე შენი მოთხოვნა...",
    en: "Type your request...",
  },
  "workspace.sampleResponse": {
    ka: "გაიგე რომ მზად ვარ დაგეხმაროთ! რით შემიძლია დაგეხმაროთ?",
    en: "I'm ready to help! How can I assist you?",
  },
  "workspace.primaryCTAToast": {
    ka: "იწყება შექმნა...",
    en: "Starting creation...",
  },
  "workspace.secondaryCTAToast": {
    ka: "იხილეთ დამატებითი ინფორმაცია",
    en: "View additional information",
  },

  // Service Pages Common
  "service.projectSetup": {
    ka: "პროექტის კონფიგურაცია",
    en: "Project Setup",
  },
  "service.parameters": {
    ka: "პარამეტრები",
    en: "Parameters",
  },
  "service.comingSoon": {
    ka: "მალე ხელმისაწვდომი იქნება",
    en: "Coming Soon",
  },
};

// Translation function that works with LanguageProvider
export function t(key: string, lang?: Language): string {
  // If lang is provided, use it; otherwise try to get from localStorage
  let language = lang;
  
  if (!language && typeof window !== "undefined") {
    const stored = localStorage.getItem("avatar_g_language") as Language;
    language = stored || "ka";
  }
  
  if (!language) {
    language = "ka";
  }

  const translation = translations[key as keyof typeof translations];

  if (!translation) {
    console.warn(`Translation missing for key: ${key}`);
    return key;
  }

  return translation[language];
}
