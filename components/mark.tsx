export function Mark({ size = 32 }: { size?: number }) {
  return (
    <img
      className="mark"
      src="/mark.webp"
      alt=""
      width={size}
      height={size}
      decoding="async"
      aria-hidden="true"
    />
  );
}
