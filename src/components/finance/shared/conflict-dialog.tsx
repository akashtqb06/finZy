'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangleIcon, RefreshCwIcon, SaveIcon } from 'lucide-react';

export interface ConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReload: () => void;
  onOverwrite: () => void;
  title?: string;
  description?: string;
}

export function ConflictDialogContentBody({
  onReload,
  onOverwrite,
  title = 'Changed on another device',
  description = 'This record was modified on another device or tab. You can reload the latest data to review the changes, or overwrite them with your current edits.',
}: {
  onReload: () => void;
  onOverwrite: () => void;
  title?: string;
  description?: string;
}) {
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2 text-amber-500">
          <AlertTriangleIcon className="size-5 shrink-0" />
          <DialogTitle className="text-foreground">{title}</DialogTitle>
        </div>
        <DialogDescription className="pt-2 text-sm text-muted-foreground">
          {description}
        </DialogDescription>
      </DialogHeader>

      <DialogFooter className="flex-col sm:flex-row gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto gap-2"
          onClick={onReload}
        >
          <RefreshCwIcon className="size-4" />
          Reload
        </Button>
        <Button
          type="button"
          variant="default"
          className="w-full sm:w-auto gap-2"
          onClick={onOverwrite}
        >
          <SaveIcon className="size-4" />
          Overwrite
        </Button>
      </DialogFooter>
    </>
  );
}

export function ConflictDialog({
  open,
  onOpenChange,
  onReload,
  onOverwrite,
  title,
  description,
}: ConflictDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <ConflictDialogContentBody
          onReload={() => {
            onReload();
            onOpenChange(false);
          }}
          onOverwrite={() => {
            onOverwrite();
            onOpenChange(false);
          }}
          title={title}
          description={description}
        />
      </DialogContent>
    </Dialog>
  );
}
