"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KeyboardIcon } from "lucide-react";
import { useAppSettings } from "@src/components/settings/app-settings-provider";

interface ShortcutGroup {
  category: string;
  items: { key: string; description: string }[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    category: "Finance Navigation",
    items: [
      { key: "G then O", description: "Go to Overview" },
      { key: "G then T", description: "Go to Transactions" },
      { key: "G then A", description: "Go to Accounts" },
      { key: "G then B", description: "Go to Budgets" },
    ],
  },
  {
    category: "Transactions & Records",
    items: [
      { key: "N", description: "Open Quick Add transaction dialog" },
      { key: "⌘ + Enter / Ctrl + Enter", description: "Save transaction form" },
      { key: "Esc", description: "Cancel or close transaction editor" },
    ],
  },
  {
    category: "General",
    items: [
      { key: "?", description: "Open keyboard shortcuts dialog" },
      { key: "Esc", description: "Close any open dialog or sheet" },
    ],
  },
];

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);
  const { appName } = useAppSettings();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing in input, textarea, or contentEditable, do not intercept '?'
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        title="Keyboard Shortcuts (?)"
        aria-label="Keyboard shortcuts"
      >
        <KeyboardIcon className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyboardIcon className="size-5" />
              Keyboard Shortcuts & Tips
            </DialogTitle>
            <DialogDescription>
              Quick reference for shortcuts and navigation in {appName}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            {SHORTCUTS.map((group) => (
              <div key={group.category} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.category}
                </h4>
                <div className="rounded-lg border divide-y bg-muted/20">
                  {group.items.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between p-2.5 text-xs"
                    >
                      <span className="text-foreground">{item.description}</span>
                      <kbd className="ml-2 shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground shadow-xs">
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

