"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";

import { cn } from "@/lib/utils";

type DrawerDirection = "top" | "right" | "bottom" | "left";

const DrawerDirectionContext = React.createContext<DrawerDirection>("bottom");

interface DrawerProps extends Omit<DrawerPrimitive.Root.Props, "swipeDirection"> {
  direction?: DrawerDirection;
}

const SWIPE_DIRECTION: Record<DrawerDirection, "up" | "down" | "left" | "right"> = {
  top: "up",
  bottom: "down",
  left: "left",
  right: "right",
};

function Drawer({ direction = "bottom", ...props }: DrawerProps) {
  return (
    <DrawerDirectionContext.Provider value={direction}>
      <DrawerPrimitive.Root data-slot="drawer" swipeDirection={SWIPE_DIRECTION[direction]} {...props} />
    </DrawerDirectionContext.Provider>
  );
}

function DrawerTrigger(props: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerClose(props: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerPortal(props: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  );
}

function DrawerContent({ className, children, ...props }: DrawerPrimitive.Popup.Props) {
  const direction = React.useContext(DrawerDirectionContext);
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Viewport className="pointer-events-none fixed inset-0 z-50">
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          data-direction={direction}
          className={cn(
            "pointer-events-auto fixed z-50 flex flex-col bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg outline-hidden transition-transform duration-200 ease-out",
            // bottom
            "data-[direction=bottom]:inset-x-0 data-[direction=bottom]:bottom-0 data-[direction=bottom]:max-h-[80vh] data-[direction=bottom]:rounded-t-xl data-[direction=bottom]:border-t",
            "data-[direction=bottom]:data-starting-style:translate-y-full data-[direction=bottom]:data-ending-style:translate-y-full",
            // top
            "data-[direction=top]:inset-x-0 data-[direction=top]:top-0 data-[direction=top]:max-h-[80vh] data-[direction=top]:rounded-b-xl data-[direction=top]:border-b",
            "data-[direction=top]:data-starting-style:-translate-y-full data-[direction=top]:data-ending-style:-translate-y-full",
            // right
            "data-[direction=right]:inset-y-0 data-[direction=right]:right-0 data-[direction=right]:h-full data-[direction=right]:w-3/4 data-[direction=right]:border-l data-[direction=right]:sm:max-w-sm",
            "data-[direction=right]:data-starting-style:translate-x-full data-[direction=right]:data-ending-style:translate-x-full",
            // left
            "data-[direction=left]:inset-y-0 data-[direction=left]:left-0 data-[direction=left]:h-full data-[direction=left]:w-3/4 data-[direction=left]:border-r data-[direction=left]:sm:max-w-sm",
            "data-[direction=left]:data-starting-style:-translate-x-full data-[direction=left]:data-ending-style:-translate-x-full",
            className
          )}
          {...props}
        >
          {children}
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex flex-col gap-0.5 p-4 md:gap-0.5 md:text-left", className)}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />;
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("font-heading text-base font-medium text-foreground", className)}
      {...props}
    />
  );
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
