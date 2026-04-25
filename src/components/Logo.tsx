export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" fill="#1f1e24" />
      <rect x="2" y="2" width="8" height="13" rx="2" fill="#4f7cf0" />
      <rect x="12" y="2" width="8" height="13" rx="2" fill="#4f7cf0" fillOpacity="0.4" />
      <rect x="22" y="2" width="8" height="13" rx="2" fill="#28272d" />
      <rect x="2" y="17" width="8" height="13" rx="2" fill="#28272d" />
      <rect x="12" y="17" width="8" height="13" rx="2" fill="#4f7cf0" />
      <rect x="22" y="17" width="8" height="13" rx="2" fill="#4f7cf0" fillOpacity="0.4" />
    </svg>
  );
}
