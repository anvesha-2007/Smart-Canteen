import { useEffect, useState } from 'react';
import { Bell, LogOut, ShoppingBag } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { cn } from './lib/utils.ts';
import { Button } from './components/ui/button.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { StudentDashboard } from './components/student/StudentDashboard.tsx';
import { StaffDashboard } from './components/staff/StaffDashboard.tsx';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';

function SmartCanteenShell() {
  const { user, loading, logout } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [studentView, setStudentView] = useState<
    'menu' | 'orders' | 'notifications' | 'profile'
  >('menu');
  const [cartOpen, setCartOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [staffPreviewMenu, setStaffPreviewMenu] = useState(false);

  // Reset subview when user switches role
  useEffect(() => {
    setStudentView('menu');
    setStaffPreviewMenu(false);
  }, [user?.id, user?.roleName]);

  const handleLogout = async () => {
    await logout();
    toast.success('Signed out safely.');
  };

  const isStaff = user?.roleName === 'staff';
  const isAdmin = user?.roleName === 'admin';
  const showStudentInterface = !isStaff && !isAdmin;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF7] text-[#202124]">
      {/* Top Navigation Bar — strict 3-zone contract */}
      <header className="sticky top-0 z-40 border-b border-[#E7E5E0] bg-white/95 backdrop-blur-sm no-print">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              setStudentView('menu');
              setStaffPreviewMenu(false);
            }}
            className="text-lg sm:text-xl font-extrabold tracking-tight text-[#202124] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Smart <span className="text-[#F97316]">Canteen</span>
          </button>

          {/* Zone 2: Concise single-line navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#5F6368]">
            {showStudentInterface ? (
              <>
                <button
                  type="button"
                  onClick={() => setStudentView('menu')}
                  className={cn(
                    'hover:text-[#202124] transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                    studentView === 'menu' && 'text-[#202124] font-semibold underline underline-offset-8 decoration-[#F97316] decoration-2'
                  )}
                >
                  Menu
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!user) return setAuthModalOpen(true);
                    setStudentView('orders');
                  }}
                  className={cn(
                    'hover:text-[#202124] transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                    studentView === 'orders' && 'text-[#202124] font-semibold underline underline-offset-8 decoration-[#F97316] decoration-2'
                  )}
                >
                  My Orders
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!user) return setAuthModalOpen(true);
                    setStudentView('notifications');
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 hover:text-[#202124] transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                    studentView === 'notifications' && 'text-[#202124] font-semibold underline underline-offset-8 decoration-[#F97316] decoration-2'
                  )}
                >
                  <Bell className="h-3.5 w-3.5" />
                  Alerts{unreadNotifCount > 0 ? ` (${unreadNotifCount})` : ''}
                </button>
                {user && (
                  <button
                    type="button"
                    onClick={() => setStudentView('profile')}
                    className={cn(
                      'hover:text-[#202124] transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                      studentView === 'profile' && 'text-[#202124] font-semibold underline underline-offset-8 decoration-[#F97316] decoration-2'
                    )}
                  >
                    Profile
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStaffPreviewMenu(false)}
                  className={cn(
                    'hover:text-[#202124] transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                    !staffPreviewMenu && 'text-[#202124] font-semibold underline underline-offset-8 decoration-[#F97316] decoration-2'
                  )}
                >
                  {isAdmin ? 'Admin Console' : 'Kitchen Queue'}
                </button>
                <button
                  type="button"
                  onClick={() => setStaffPreviewMenu(true)}
                  className={cn(
                    'hover:text-[#202124] transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                    staffPreviewMenu && 'text-[#202124] font-semibold underline underline-offset-8 decoration-[#F97316] decoration-2'
                  )}
                >
                  Canteen Menu
                </button>
              </>
            )}

            {user && (
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1 text-[#5F6368] hover:text-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            )}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            {showStudentInterface || staffPreviewMenu ? (
              user ? (
                <Button size="sm" onClick={() => setCartOpen(true)}>
                  <ShoppingBag className="h-4 w-4" />
                  Cart ({cartCount})
                </Button>
              ) : (
                <Button size="sm" onClick={() => setAuthModalOpen(true)}>
                  Sign In
                </Button>
              )
            ) : (
              <Button size="sm" variant="outline" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            )}
          </div>
        </div>

        {/* Mobile Secondary Navigation Row */}
        <div className="flex md:hidden items-center justify-between border-t border-[#F3F2EE] px-4 py-2 overflow-x-auto gap-4 text-xs font-semibold text-[#5F6368]">
          {showStudentInterface ? (
            <>
              <button
                type="button"
                onClick={() => setStudentView('menu')}
                className={cn('whitespace-nowrap shrink-0', studentView === 'menu' && 'text-[#EA580C]')}
              >
                Menu
              </button>
              <button
                type="button"
                onClick={() => (user ? setStudentView('orders') : setAuthModalOpen(true))}
                className={cn('whitespace-nowrap shrink-0', studentView === 'orders' && 'text-[#EA580C]')}
              >
                My Orders
              </button>
              <button
                type="button"
                onClick={() =>
                  user ? setStudentView('notifications') : setAuthModalOpen(true)
                }
                className={cn(
                  'whitespace-nowrap shrink-0',
                  studentView === 'notifications' && 'text-[#EA580C]'
                )}
              >
                Alerts{unreadNotifCount > 0 ? ` (${unreadNotifCount})` : ''}
              </button>
              {user && (
                <>
                  <button
                    type="button"
                    onClick={() => setStudentView('profile')}
                    className={cn(
                      'whitespace-nowrap shrink-0',
                      studentView === 'profile' && 'text-[#EA580C]'
                    )}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="whitespace-nowrap shrink-0 text-red-700"
                  >
                    Sign Out
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStaffPreviewMenu(false)}
                className={cn('whitespace-nowrap shrink-0', !staffPreviewMenu && 'text-[#EA580C]')}
              >
                {isAdmin ? 'Admin Console' : 'Kitchen Queue'}
              </button>
              <button
                type="button"
                onClick={() => setStaffPreviewMenu(true)}
                className={cn('whitespace-nowrap shrink-0', staffPreviewMenu && 'text-[#EA580C]')}
              >
                Canteen Menu
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {loading ? (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
            <div className="h-64 rounded-2xl border border-[#E7E5E0] bg-white animate-pulse" />
          </div>
        ) : isAdmin && !staffPreviewMenu ? (
          <AdminDashboard />
        ) : isStaff && !staffPreviewMenu ? (
          <StaffDashboard />
        ) : (
          <StudentDashboard
            activeView={studentView}
            setActiveView={setStudentView}
            cartOpen={cartOpen}
            setCartOpen={setCartOpen}
            onCartCountChange={setCartCount}
            onUnreadNotifChange={setUnreadNotifCount}
            onRequireAuth={() => setAuthModalOpen(true)}
          />
        )}
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-[#E7E5E0] bg-white py-6 mt-12 no-print">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#5F6368]">
          <p>
            Smart Canteen · College Canteen Pre-Ordering System
          </p>
          <p>
            Mon–Sat · 08:30 AM – 05:30 PM · Demo Payment Gateway Active
          </p>
        </div>
      </footer>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
      <Toaster position="bottom-right" richColors />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SmartCanteenShell />
    </AuthProvider>
  );
}
