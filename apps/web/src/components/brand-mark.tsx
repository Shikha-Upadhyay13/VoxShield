export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="relative grid place-items-center rounded-xl"
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.2), transparent 40%), linear-gradient(160deg, #16342e, #0b1c22)",
        boxShadow: "0 0 0 1px rgba(124,232,204,0.25), 0 8px 20px rgba(0,0,0,0.35)",
      }}
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3c-3.2 2.4-5 5.3-5 9.2 0 2.4.8 4.4 2.2 6.1"
          stroke="#7ce8cc"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M12 3c3.2 2.4 5 5.3 5 9.2 0 2.4-.8 4.4-2.2 6.1"
          stroke="#9bb7ff"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path d="M8.2 11.2h7.6" stroke="#7ce8cc" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="12" cy="11.2" r="1.15" fill="#eef3f8" />
      </svg>
    </span>
  );
}
