import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import { toast } from "sonner";

export const ClickToCopy = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    text: string;
  }
>(({ className, text }, ref) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div
      ref={ref}
      className={cn("cursor-pointer hover:text-primary", className)}
      onClick={handleCopy}
    >
      {text}
    </div>
  );
});
