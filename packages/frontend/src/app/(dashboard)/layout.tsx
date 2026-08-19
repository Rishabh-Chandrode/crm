import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50/60 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
