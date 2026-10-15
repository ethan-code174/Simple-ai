import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center px-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-accent/20 blur-[120px]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo href="/" /></div>
        <div className="rounded-2xl border border-line bg-card/80 p-6 shadow-soft backdrop-blur">{children}</div>
      </div>
    </div>
  );
}
