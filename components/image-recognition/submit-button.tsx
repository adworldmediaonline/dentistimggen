"use client"

import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"

export function SubmitButton({
  children,
  pendingLabel,
  disabled = false,
}: {
  children: React.ReactNode
  pendingLabel: string
  disabled?: boolean
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? pendingLabel : children}
    </Button>
  )
}
