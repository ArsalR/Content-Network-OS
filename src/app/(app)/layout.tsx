import { Sidebar } from "@/components/nav/sidebar";
import { Topbar } from "@/components/nav/topbar";
import { seedDefaults } from "@/lib/seed";

export const dynamic = "force-dynamic";

let seeded = false;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!seeded) {
    await seedDefaults().catch(() => {});
    seeded = true;
  }
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
