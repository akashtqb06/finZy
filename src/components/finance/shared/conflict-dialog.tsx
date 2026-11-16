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

export function ConflictDialog({
  open,
  onOpenChange,
  onReload,
  onOverwrite,
  title = 'Changed on another device',
  description = 'This record was modified on another device or tab. You can reload the latest data to review the changes, or overwrite them with your current edits.',
}: ConflictDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
            onClick={() => {
              onReload();
              onOpenChange(false);
            }}
          >
            <RefreshCwIcon className="size-4" />
            Reload
          </Button>
          <Button
            type="button"
            variant="default"
            className="w-full sm:w-auto gap-2"
            onClick={() => {
              onOverwrite();
              onOpenChange(false);
            }}
          >
            <SaveIcon className="size-4" />
            Overwrite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
