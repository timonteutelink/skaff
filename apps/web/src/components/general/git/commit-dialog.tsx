"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitCommit } from "lucide-react";

interface CommitButtonProps {
  onCommit: (message: string) => Promise<void>;
  onCancel: () => void;
}

// This component will be used in the project diff details page to allow the user to commit current changes.
// Also will be used at the end of the instatiation workflow on the diff page.
export default function CommitButton({
  onCommit,
  onCancel,
}: CommitButtonProps) {
  const [open, setOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");

  const handleCommit = useCallback(async () => {
    await onCommit(commitMessage);
    setCommitMessage("");
    setOpen(false);
  }, [commitMessage, onCommit]);

  const handleCancel = useCallback(() => {
    onCancel();
    setCommitMessage("");
    setOpen(false);
  }, [onCancel]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <GitCommit className="mr-2" />
          Commit Changes
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Commit</DialogTitle>
          <DialogDescription>
            Enter a message describing the changes you've made.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="commit-message" className="text-right">
              Message
            </Label>
            <Input
              id="commit-message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="feat: add new feature"
              className="col-span-3"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleCommit} disabled={!commitMessage.trim()}>
            Commit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
