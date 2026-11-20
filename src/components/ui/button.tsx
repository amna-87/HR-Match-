import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "link";
type Size = "default" | "sm" | "lg";

const variants: Record<Variant, string> = {
  default: "btn-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary-hover",
  secondary: "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/70",
  outline: "border border-border bg-card shadow-sm hover:border-slate-300 hover:bg-muted dark:hover:border-slate-600",
  ghost: "hover:bg-muted",
  destructive: "bg-destructive text-white shadow-sm hover:bg-destructive/90",
  link: "text-primary underline-offset-4 hover:underline px-0",
};
const sizes: Record<Size, string> = {
  default: "h-11 px-4 py-2",
  sm: "h-8 px-3 text-sm",
  lg: "h-12 px-6 text-base",
};

export function buttonClasses(variant: Variant = "default", size: Size = "default", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}
