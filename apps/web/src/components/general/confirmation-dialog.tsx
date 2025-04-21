"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useCallback, useState } from "react"
import { Result } from "@repo/ts/utils/types"
import { toast } from "sonner"

interface ConfirmationDialogProps {
  buttonText: string

  actionText: string

  dialogTitle: string
  dialogDescription: string

  onConfirm: () => Promise<Result<void>>
  onCancel?: () => Promise<Result<void>>
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({ buttonText, actionText, dialogTitle, dialogDescription, onConfirm, onCancel }) => {
  const [open, setOpen] = useState(false)

  const handleConfirmAction = useCallback(async () => {
    const actionResult = await onConfirm()
    if ("error" in actionResult) {
      console.error("Error:", actionResult.error)
      toast.error("An error occurred while performing the action.")
      return
    }
    console.log("Action completed successfully")
    setOpen(false)
  }, [onConfirm])

  const handleCancel = useCallback(async () => {
    if (!onCancel) {
      setOpen(false)
      return
    }
    const cancelResult = await onCancel()
    if ("error" in cancelResult) {
      console.error("Error:", cancelResult.error)
      toast.error("An error occurred while performing the action.")
      return
    }
    console.log("Cancel action completed successfully")
    setOpen(false)
  }, [onCancel])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{buttonText}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirmAction} className="ml-2">
            {actionText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

