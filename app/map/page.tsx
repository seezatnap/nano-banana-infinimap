import { Suspense } from "react";

export default function Page() {
  return (
    <main className="w-screen h-screen">
      <Suspense fallback={<div>Loading map...</div>}>
        <ClientBoundary />
      </Suspense>
    </main>
  );
}

async function ClientBoundary() {
  const MapClient = (await import("@/components/MapClient")).default;
  return <MapClient />;
}