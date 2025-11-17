"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormEvent, useCallback, useState } from "react";

interface GitRepoSelectionDialogProps {
  buttonText: string;
  actionText: string;

  onConfirm: (repoUrl: string, branch?: string) => Promise<void>;
  onCancel?: () => Promise<void>;
}

export const GitRepoSelectionDialog: React.FC<GitRepoSelectionDialogProps> = ({
  buttonText,
  actionText,
  onConfirm,
  onCancel,
}) => {
  const [open, setOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setRepoUrl("");
    setBranch("");
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) {
        return;
      }
      const trimmedUrl = repoUrl.trim();
      const trimmedBranch = branch.trim();
      if (!trimmedUrl) {
        return;
      }
      setIsSubmitting(true);
      try {
        await onConfirm(trimmedUrl, trimmedBranch || undefined);
        resetForm();
        setOpen(false);
      } finally {
        setIsSubmitting(false);
      }
    },
    [branch, isSubmitting, onConfirm, repoUrl, resetForm],
  );

  const handleCancel = useCallback(async () => {
    if (isSubmitting) {
      return;
    }
    if (onCancel) {
      await onCancel();
    }
    resetForm();
    setOpen(false);
  }, [isSubmitting, onCancel, resetForm]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          resetForm();
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
          <DialogTitle>Select Git Repository</DialogTitle>
          {/* <DialogDescription></DialogDescription> */}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="repository-url">Repository URL</Label>
            <Input
              id="repository-url"
              name="repoUrl"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              type="text"
              placeholder="git@github.com:org/example-templates.git"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repository-branch">Branch (optional)</Label>
            <Input
              id="repository-branch"
              name="branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              type="text"
              placeholder="main"
            />
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={handleCancel}
              type="button"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              type="submit"
              className="ml-2"
              disabled={isSubmitting || !repoUrl.trim()}
            >
              {actionText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
