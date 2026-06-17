import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

const sizeClass: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "",
  lg: "px-6 py-3 text-base rounded-xl",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

export function Button({ variant = "primary", size = "md", className = "", children, ...rest }: Props) {
  const sizeOverride = size !== "md" ? sizeClass[size] : "";
  const base = variantClass[variant];
  return (
    <button type="button" className={`${base} ${sizeOverride} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}
