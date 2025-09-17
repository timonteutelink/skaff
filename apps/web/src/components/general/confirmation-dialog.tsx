"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormEvent, useCallback, useState } from "react";
import { Result } from "@timonteutelink/skaff-lib/browser";

interface ConfirmationDialogProps {
  buttonText: string;

  actionText: string;

  dialogTitle: string;
  dialogDescription: string;

  onConfirm: () => Promise<Result<void>>;
  onCancel?: () => Promise<Result<void>>;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  buttonText,
  actionText,
  dialogTitle,
  dialogDescription,
  onConfirm,
  onCancel,
}) => {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirmAction = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) {
        return;
      }
      setIsSubmitting(true);
      try {
        const result = await onConfirm();
        if ("error" in result) {
          return;
        }
        setOpen(false);
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, onConfirm],
  );

  const handleCancel = useCallback(async () => {
    if (isSubmitting) {
      return;
    }
    if (!onCancel) {
      setOpen(false);
      return;
    }
    const cancelResult = await onCancel();
    if ("error" in cancelResult) {
      return;
    }
    setOpen(false);
  }, [isSubmitting, onCancel]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setIsSubmitting(false);
        }
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">{buttonText}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleConfirmAction} className="mt-4">
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              type="button"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              type="submit"
              className="ml-2"
              disabled={isSubmitting}
            >
              {actionText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
