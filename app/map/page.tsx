import { Suspense } from "react";

export default function Page() {
  return (
    <main className="w-screen h-screen">
      <Suspense fallback={<div className="w-screen h-screen flex items-center justify-center">Loading map...</div>}>
        <ClientBoundary />
      </Suspense>
    </main>
  );
}

async function ClientBoundary() {
  const MapApp = (await import("../../components/map-app")).default;
  return <MapApp />;
}