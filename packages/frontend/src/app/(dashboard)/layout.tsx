import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 transition-colors">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
