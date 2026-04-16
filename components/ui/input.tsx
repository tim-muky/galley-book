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
            "w-full bg-white border border-anthracite rounded-full px-4 py-3 text-sm font-light text-anthracite placeholder:text-on-surface-variant/40 placeholder:font-thin outline-none focus-visible:ring-2 focus-visible:ring-anthracite focus-visible:ring-offset-2 transition-shadow",
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
