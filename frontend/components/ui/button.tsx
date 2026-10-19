import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-accent text-white hover:bg-accent/90 dark:text-bg",
        secondary: "border border-line bg-card text-fg hover:bg-line/60",
        ghost: "text-muted hover:bg-line/50 hover:text-fg",
        danger: "bg-bad/90 text-white hover:bg-bad",
        outline: "border border-line text-fg hover:border-fg/40",
        success: "bg-ok/90 text-white hover:bg-ok",
      },
      size: { default: "h-12 px-5", sm: "h-10 px-4 text-sm", lg: "h-14 px-7 text-lg", xl: "h-16 px-8 text-xl", icon: "h-11 w-11" },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";
