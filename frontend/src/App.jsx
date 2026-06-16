import React from "react";

const APP_NAME = "CareLine";
const TAGLINE = "One button. Always connected.";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <h1 className="font-[var(--font-display)] text-4xl text-[var(--color-pine)]">
        {APP_NAME}
      </h1>
      <p className="text-sm text-[var(--color-ink)]/60 mt-2">{TAGLINE}</p>
      <p className="mt-6 text-[var(--color-ink)]/40 text-xs">
        Caregiver dashboard loading…
      </p>
    </div>
  );
}
