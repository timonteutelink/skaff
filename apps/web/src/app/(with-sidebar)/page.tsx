"use client";

import { useCallback } from "react";

export default function Home() {
  const handleRunStuff = useCallback(async () => {
  }, []);
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <button onClick={() => handleRunStuff()}>Run Stuff</button>
    </div>
  );
}
