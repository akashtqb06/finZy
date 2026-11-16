"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster({
  position = "top-right",
  richColors = true,
  closeButton = true,
  ...props
}: ToasterProps) {
  return (
    <Sonner
      position={position}
      richColors={richColors}
      closeButton={closeButton}
      className="toaster group z-[80] [&_[data-sonner-toaster]]:z-[80] max-md:[&_[data-sonner-toaster]]:bottom-[calc(var(--bottom-nav-h)+16px)]"
      toastOptions={{
        classNames: {
          toast: "group toast shadow-lg border border-border",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: "!border !border-border !bg-background !text-foreground hover:!bg-muted",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--offset": "calc(var(--bottom-nav-h) + 16px)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
