import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center px-4">
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo href="/" /></div>
        <div className="rounded-lg border border-line bg-card p-6">{children}</div>
      </div>
    </div>
  );
}
