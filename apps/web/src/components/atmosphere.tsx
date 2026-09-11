export function Atmosphere() {
  return (
    <>
      <div className="grain" />
      <div
        className="orb"
        style={{
          width: 420,
          height: 420,
          top: -120,
          right: -40,
          background: "rgba(124,232,204,0.22)",
        }}
      />
      <div
        className="orb"
        style={{
          width: 340,
          height: 340,
          bottom: -80,
          left: -60,
          background: "rgba(155,183,255,0.16)",
          animationDelay: "-7s",
        }}
      />
    </>
  );
}

export function PageIntro({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="mb-6 max-w-2xl">
      <div className="kicker">{kicker}</div>
      <h1 className="font-serif mt-2 text-3xl tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</p>
    </div>
  );
}
