import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "tertiary";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-light transition-opacity active:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed",
          // Variants
          variant === "primary" && "bg-anthracite text-white rounded-full",
          variant === "ghost" && "bg-transparent border border-[#C6C6C6]/30 text-anthracite rounded-full",
          variant === "tertiary" && "bg-transparent text-anthracite",
          // Sizes
          size === "sm" && "text-xs px-4 py-2",
          size === "md" && "text-sm px-6 py-3",
          size === "lg" && "text-sm px-8 py-4 w-full",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
