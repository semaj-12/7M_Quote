interface IBeamProps {
  className?: string;
}

export default function IBeam({ className = "h-6 w-6" }: IBeamProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* I-Beam structural steel SVG */}
      <rect x="4" y="3" width="16" height="2" rx="0.5"/>
      <rect x="11" y="5" width="2" height="14"/>
      <rect x="4" y="19" width="16" height="2" rx="0.5"/>
    </svg>
  );
}