"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface Toast {
  id: string
  title?: string
  description?: string
  variant?: "default" | "destructive"
  duration?: number
}

interface ToastState {
  toasts: Toast[]
}

type ToastAction =
  | { type: "ADD_TOAST"; toast: Toast }
  | { type: "DISMISS_TOAST"; toastId: string }

let listeners: Array<(state: ToastState) => void> = []
let memoryState: ToastState = { toasts: [] }
let count = 0

function generateId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

function dispatch(action: ToastAction) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

function reducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, 5),
      }
    case "DISMISS_TOAST":
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
    default:
      return state
  }
}

interface ToastOptions {
  title?: string
  description?: string
  variant?: "default" | "destructive"
  duration?: number
}

function toast(options: ToastOptions) {
  const id = generateId()
  const newToast: Toast = {
    id,
    title: options.title,
    description: options.description,
    variant: options.variant || "default",
    duration: options.duration || 5000,
  }

  dispatch({ type: "ADD_TOAST", toast: newToast })

  if (newToast.duration && newToast.duration > 0) {
    setTimeout(() => {
      dispatch({ type: "DISMISS_TOAST", toastId: id })
    }, newToast.duration)
  }

  return {
    id,
    dismiss: () => dispatch({ type: "DISMISS_TOAST", toastId: id }),
  }
}

function useToast() {
  const [state, setState] = React.useState<ToastState>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [])

  return {
    ...state,
    toast,
    dismiss: (toastId: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:max-w-[420px]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all",
            t.variant === "destructive"
              ? "border-destructive bg-destructive text-destructive-foreground"
              : "border bg-background text-foreground"
          )}
        >
          <div className="flex-1">
            {t.title && <div className="text-sm font-semibold">{t.title}</div>}
            {t.description && (
              <div className="text-sm opacity-90">{t.description}</div>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

export { toast, useToast, Toaster }
export type { Toast, ToastOptions }
