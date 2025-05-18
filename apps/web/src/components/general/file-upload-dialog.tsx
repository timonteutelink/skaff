"use client";
import React, { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDropzone } from "react-dropzone";
import { X, FileJson } from "lucide-react";
import { cn, toastNullError } from "@/lib/utils";
import { Result } from "@timonteutelink/code-templator-lib/lib/types";

export type JsonFile = { name: string; text: string };

export interface FileUploadDialogProps {
  buttonText: string;
  multiple?: boolean;
  onUpload: (jsons: JsonFile[]) => Promise<Result<void>>;
  onCancel: () => Promise<Result<void>>;
}

export const FileUploadDialog: React.FC<FileUploadDialogProps> = ({
  buttonText,
  multiple = false,
  onUpload,
  onCancel,
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (!multiple) {
        setFiles([accepted[accepted.length - 1]!]);
      } else {
        setFiles((prev) => [...prev, ...accepted]);
      }
    },
    [multiple],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/json": [".json"] },
    multiple,
    onDrop,
    maxSize: 1 * 1024 * 1024, // max 1 mb
  });

  const handleUpload = useCallback(async () => {
    setUploading(true);
    const jsons: JsonFile[] = await Promise.all(
      files.map(async (f) => ({ name: f.name, text: await f.text() })),
    );

    const result = await onUpload(jsons);

    const uploadResult = toastNullError({
      result,
      shortMessage: "Failed to upload files",
    });

    setUploading(false);
    if (uploadResult === false) {
      return;
    }

    setFiles([]);
  }, [files, onUpload]);

  const handleCancel = useCallback(async () => {
    const result = await onCancel();
    const cancelResult = toastNullError({
      result,
      shortMessage: "Failed to cancel modal",
    });

    setFiles([]);
    if (cancelResult === false) {
      return;
    }
  }, [onCancel]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    },
    [handleCancel],
  );

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>{buttonText}</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Select file{multiple ? "(s)" : ""}</span>
          </DialogTitle>
          <DialogDescription>
            Drag .json file{multiple ? "s" : ""} here or click the area below,
            then press <b>Start upload</b>.
          </DialogDescription>
        </DialogHeader>

        <div
          {...getRootProps()}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-sm transition",
            isDragActive
              ? "border-primary/50 bg-primary/5"
              : "border-muted/40 hover:bg-muted/5",
          )}
        >
          <input {...getInputProps()} />
          <Label className="cursor-pointer select-none">
            {isDragActive
              ? "Release to drop the files"
              : "Drop files or click to browse"}
          </Label>
        </div>

        {!!files.length && (
          <ul className="mt-4 max-h-40 overflow-y-auto space-y-2 text-sm">
            {files.map((f) => (
              <li key={f.name} className="flex items-center gap-2">
                <FileJson className="size-4 shrink-0" />
                <span className="truncate">{f.name}</span>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button onClick={handleUpload} disabled={!files.length || uploading}>
            {uploading ? "Uploading…" : "Start upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
