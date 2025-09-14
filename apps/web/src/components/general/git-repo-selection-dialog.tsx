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
import {Input} from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCallback, useState } from "react";

interface GitRepoSelectionDialogProps {
	buttonText: string
	actionText: string

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

  const handleConfirmAction = useCallback(async () => {
    await onConfirm(githubUrl, branch);
    setOpen(false);
  }, [onConfirm, githubUrl, branch]);

  const handleCancel = useCallback(async () => {
    if (!onCancel) {
      setOpen(false);
      return;
    }
    await onCancel();
    setOpen(false);
  }, [onCancel]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{buttonText}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Select Github Repo</DialogTitle>
					{/* <DialogDescription></DialogDescription> */}
        </DialogHeader>
					<div>
					  <label>
							Github Url
							<Input
								name="githubUrl"
								value={githubUrl}
								onChange={(e)=>setGithubUrl(e.target.value)}
								type="text"
								placeholder="https://github.com/timonteutelink/example-templates"
							/>
						</label>
					  <label>
							Branch
							<Input
								name="branch"
								value={branch}
								onChange={(e)=>setBranch(e.target.value)}
								type="text"
								placeholder="main"
							/>
						</label>
				  
					</div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleConfirmAction}
            className="ml-2"
          >
					  {actionText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
