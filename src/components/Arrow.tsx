interface Props {
  /** Compass bearing the arrow should point toward (0 = N, 90 = E). */
  deg: number;
  size?: number;
  title?: string;
  className?: string;
}

/** A north-up arrow rotated to point toward `deg`. Inherits `currentColor`. */
export function Arrow({ deg, size = 22, title, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ transform: `rotate(${deg}deg)`, flex: "none" }}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M12 21 L12 5 M12 5 L6.5 11 M12 5 L17.5 11"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
