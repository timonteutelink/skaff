import { Loader2 } from "lucide-react";

export default function GlobalLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white/60 z-50">
      <Loader2 className="animate-spin h-12 w-12 text-blue-600" />
    </div>
  );
}

