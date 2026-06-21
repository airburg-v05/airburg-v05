import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

const baseProps = {
  fill: "none",
  viewBox: "0 0 24 24",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const HomeIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="m3 11 9-8 9 8" />
    <path d="M5 10v10h14V10" />
    <path d="M9 20v-6h6v6" />
  </svg>
);

export const ProductIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M6 3h12l2 5-8 4-8-4 2-5Z" />
    <path d="M4 8v10l8 4 8-4V8" />
    <path d="m12 12 8-4" />
    <path d="M12 12v10" />
  </svg>
);

export const LayersIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 16 9 5 9-5" />
  </svg>
);

export const StoreIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M4 10v10h16V10" />
    <path d="M3 4h18l-2 6H5L3 4Z" />
    <path d="M9 20v-6h6v6" />
  </svg>
);

export const UploadIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M12 16V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M4 15v5h16v-5" />
  </svg>
);

export const TableIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M9 4v16" />
  </svg>
);

export const MenuIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export const CloseIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const ChevronRightIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const CheckIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="m5 12 4 4L19 6" />
  </svg>
);

export const AlertIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const DatabaseIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </svg>
);

export const ArrowUpRightIcon = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);
