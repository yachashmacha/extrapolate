"use client";

import { useState } from "react";

export function NewsPhoto({
  src,
  alt,
  className,
  linkClassName,
  href,
  label,
  width,
  height,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  linkClassName?: string;
  href?: string;
  label?: string;
  width?: number | null;
  height?: number | null;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const image = (
    <img
      src={src}
      alt={alt}
      className={className}
      width={width && width > 0 ? width : undefined}
      height={height && height > 0 ? height : undefined}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(true)}
    />
  );
  if (!href) return image;
  return (
    <a className={linkClassName} href={href} target="_blank" rel="noreferrer" aria-label={label}>
      {image}
    </a>
  );
}
