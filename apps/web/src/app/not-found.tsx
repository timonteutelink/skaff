import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <h1 className="text-6xl font-bold">404</h1>
      <p className="mt-4 text-lg">Sorry, we couldn’t find that page.</p>
      <Link href="/" className="mt-6 inline-block underline">
        Go back home
      </Link>
    </div>
  );
}

