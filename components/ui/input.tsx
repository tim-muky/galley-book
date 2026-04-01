import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-xs font-semibold text-anthracite tracking-wide uppercase">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "bg-surface-highest rounded-sm px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/50 placeholder:font-thin outline-none focus:ring-1 focus:ring-anthracite/20 transition-shadow",
            error && "ring-1 ring-red-400",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs font-light text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
