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

  onConfirm: (repoUrl: string, branch: string) => Promise<void>;
  onCancel?: () => Promise<void>;
}

export const GitRepoSelectionDialog: React.FC<GitRepoSelectionDialogProps> = ({
  buttonText,
  actionText,
  onConfirm,
  onCancel,
}) => {
  const [open, setOpen] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setGithubUrl("");
    setBranch("main");
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) {
        return;
      }
      const trimmedUrl = githubUrl.trim();
      const trimmedBranch = branch.trim();
      if (!trimmedUrl || !trimmedBranch) {
        return;
      }
      setIsSubmitting(true);
      try {
        await onConfirm(trimmedUrl, trimmedBranch);
        resetForm();
        setOpen(false);
      } finally {
        setIsSubmitting(false);
      }
    },
    [branch, githubUrl, isSubmitting, onConfirm, resetForm],
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
          <DialogTitle>Select Github Repo</DialogTitle>
          {/* <DialogDescription></DialogDescription> */}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="github-url">GitHub URL</Label>
            <Input
              id="github-url"
              name="githubUrl"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              type="url"
              placeholder="https://github.com/timonteutelink/example-templates"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="github-branch">Branch</Label>
            <Input
              id="github-branch"
              name="branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              type="text"
              placeholder="main"
              required
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
              disabled={
                isSubmitting || !githubUrl.trim() || !branch.trim()
              }
            >
              {actionText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
