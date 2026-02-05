import { create } from 'zustand'

interface ServiceState {
  currentService: string | null
  setCurrentService: (service: string | null) => void
  isChatOpen: boolean
  setIsChatOpen: (open: boolean) => void
}

export const useStore = create<ServiceState>((set) => ({
  currentService: null,
  setCurrentService: (service) => set({ currentService: service }),
  isChatOpen: false,
  setIsChatOpen: (open) => set({ isChatOpen: open }),
}))
