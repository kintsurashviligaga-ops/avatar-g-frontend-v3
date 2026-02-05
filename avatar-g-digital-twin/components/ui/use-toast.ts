"use client"
import * as React from "react"

const TOAST_LIMIT = 1
let count = 0
function genId() { count = (count + 1) % Number.MAX_SAFE_INTEGER; return count.toString() }

type ToasterToast = { id: string; title?: React.ReactNode; description?: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }
type Action = { type: "ADD_TOAST"; toast: ToasterToast } | { type: "DISMISS_TOAST"; toastId?: string } | { type: "REMOVE_TOAST"; toastId?: string }

interface State { toasts: ToasterToast[] }
const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => { listener(memoryState) })
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_TOAST": return { ...state, toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) }
    case "DISMISS_TOAST": return { ...state, toasts: state.toasts.map((t) => t.id === action.toastId ? { ...t, open: false } : t) }
    case "REMOVE_TOAST": if (action.toastId === undefined) return { ...state, toasts: [] }
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.toastId) }
  }
}

type Toast = Omit<ToasterToast, "id">
export function toast({ ...props }: Toast) {
  const id = genId()
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })
  dispatch({ type: "ADD_TOAST", toast: { ...props, id, open: true, onOpenChange: (open) => { if (!open) dismiss() } } })
  return { id, dismiss }
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState)
  React.useEffect(() => {
    listeners.push(setState)
    return () => { const index = listeners.indexOf(setState); if (index > -1) listeners.splice(index, 1) }
  }, [state])
  return { ...state, toast, dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }) }
}
