import { Oxanium } from '@/app/fonts';

type RootineLogoProps = {
  className?: string;
};

export default function RootineLogo({ className = '' }: RootineLogoProps) {
  return (
    <div
      className={`${Oxanium.className} font-bold tracking-tight ${className}`}
    >
      ROOTINE
    </div>
  );
}