import { type LucideProps } from "lucide-react";
import * as LucideIcons from "lucide-react";

export type IconName = keyof typeof LucideIcons;

interface IconProps extends Omit<LucideProps, "ref"> {
  name: IconName;
}

export function Icon({ name, strokeWidth = 1.5, size = 16, ...props }: IconProps) {
  const LucideIcon = LucideIcons[name] as React.ComponentType<LucideProps>;
  if (!LucideIcon) return null;
  return <LucideIcon strokeWidth={strokeWidth} size={size} {...props} />;
}
