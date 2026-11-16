/**
 * Rule: `nativeButton` must match the element that is actually rendered.
 * - The rendered element is a real <button> (including a shadcn <Button> or <button>):
 *   leave nativeButton at its default (true); remove the nativeButton={false} prop.
 * - The rendered element is NOT a button (a, Link, div, span, li):
 *   nativeButton={false} is required.
 */

"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { cn } from "@/lib/utils"
import { Button, resolveNativeButton } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger({ nativeButton, render, ...props }: DrawerPrimitive.Trigger.Props) {
  return (
    <DrawerPrimitive.Trigger
      data-slot="drawer-trigger"
      nativeButton={resolveNativeButton(nativeButton, render)}
      render={render}
      {...props}
    />
  )
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({ nativeButton, render, ...props }: DrawerPrimitive.Close.Props) {
  return (
    <DrawerPrimitive.Close
      data-slot="drawer-close"
      nativeButton={resolveNativeButton(nativeButton, render)}
      render={render}
      {...props}
    />
  )
}

function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DrawerPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Popup
        data-slot="drawer-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[96dvh] flex-col rounded-t-[1.25rem] border-t bg-background text-foreground shadow-2xl transition duration-200 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full",
          className
        )}
        {...props}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />
        {children}
        {showCloseButton && (
          <DrawerPrimitive.Close
            render={
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3.5 right-3.5 size-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              />
            }
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DrawerPrimitive.Close>
        )}
      </DrawerPrimitive.Popup>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex flex-col gap-1.5 px-4 pt-2 pb-3 text-left", className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-base font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  )
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
