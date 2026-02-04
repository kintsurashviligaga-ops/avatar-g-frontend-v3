import { Project, Preset, JobRecord, ServiceId } from "@/lib/types/runtime";

const KEYS = {
  lang: "ag.lang",
  projects: "ag.projects",
  presets: (serviceId: ServiceId) => "ag.presets." + serviceId,
  history: (serviceId: ServiceId) => "ag.history." + serviceId,
  handoff: "ag.handoff",
  avatars: "ag.avatars",
  chatHistory: (id: string) => "ag.chat." + id,
  globalChat: "ag.chatbot.history",
};

// Projects
export function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(KEYS.projects);
  return data ? JSON.parse(data) : [];
}

export function saveProjects(projects: Project[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.projects, JSON.stringify(projects));
}

export function addProject(project: Project) {
  const projects = loadProjects();
  projects.unshift(project);
  saveProjects(projects);
}

// Presets
export function loadPresets(serviceId: ServiceId): Preset[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(KEYS.presets(serviceId));
  return data ? JSON.parse(data) : [];
}

export function savePresets(serviceId: ServiceId, presets: Preset[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.presets(serviceId), JSON.stringify(presets));
}

export function addPreset(serviceId: ServiceId, preset: Preset) {
  const presets = loadPresets(serviceId);
  presets.unshift(preset);
  savePresets(serviceId, presets);
}

// History
export function loadHistory(serviceId: ServiceId): JobRecord[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(KEYS.history(serviceId));
  return data ? JSON.parse(data) : [];
}

export function saveHistory(serviceId: ServiceId, history: JobRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.history(serviceId), JSON.stringify(history));
}

export function pushHistory(serviceId: ServiceId, job: JobRecord) {
  const history = loadHistory(serviceId);
  history.unshift(job);
  if (history.length > 20) history.length = 20;
  saveHistory(serviceId, history);
}

export function updateHistory(
  serviceId: ServiceId,
  jobId: string,
  patch: Partial<JobRecord>
) {
  const history = loadHistory(serviceId);
  const index = history.findIndex((j) => j.id === jobId);
  if (index >= 0) {
    history[index] = { ...history[index], ...patch };
    saveHistory(serviceId, history);
  }
}

// Handoff
export function saveHandoff(packet: any) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.handoff, JSON.stringify(packet));
}

export function loadHandoff() {
  if (typeof window === "undefined") return null;
  const data = localStorage.getItem(KEYS.handoff);
  return data ? JSON.parse(data) : null;
}

export function clearHandoff() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEYS.handoff);
}

// Avatars
export function loadAvatars(): any[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(KEYS.avatars);
  return data ? JSON.parse(data) : [];
}

export function saveAvatar(avatar: any) {
  if (typeof window === "undefined") return;
  const avatars = loadAvatars();
  avatars.unshift({ ...avatar, id: avatar.id || Date.now().toString(), createdAt: new Date().toISOString() });
  if (avatars.length > 10) avatars.length = 10;
  localStorage.setItem(KEYS.avatars, JSON.stringify(avatars));
}

export function getAvatarById(id: string): any | null {
  const avatars = loadAvatars();
  return avatars.find(a => a.id === id) || null;
}

// Chat History
export function loadChatHistory(chatId: string): any[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(KEYS.chatHistory(chatId));
  return data ? JSON.parse(data) : [];
}

export function saveChatHistory(chatId: string, messages: any[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.chatHistory(chatId), JSON.stringify(messages.slice(-100)));
}

// Global Chatbot History
export function loadGlobalChatHistory(): any[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(KEYS.globalChat);
  return data ? JSON.parse(data) : [];
}

export function saveGlobalChatHistory(messages: any[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.globalChat, JSON.stringify(messages.slice(-50)));
}
