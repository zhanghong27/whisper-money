import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { LogOut, Plus, BookOpen, BarChart3 } from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
  user: User;
  onAddTransaction?: () => void;
}

const AppLayout = ({ children, user, onAddTransaction }: AppLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const cleanupAuthState = () => {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
        localStorage.removeItem(key);
      }
    });
  };

  const handleSignOut = async () => {
    try {
      cleanupAuthState();
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (err) {
        // Ignore errors
      }
      window.location.href = '/auth';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header
        className="sticky top-0 z-50 w-full border-b bg-gradient-soft/95 backdrop-blur supports-[backdrop-filter]:bg-gradient-soft/60 pointer-events-none shadow-soft"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 50px)' }}
      >
        <div className="container flex h-16 items-center justify-between px-4 pointer-events-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-playful rounded-2xl flex items-center justify-center shadow-cute animate-pulse">
              <span className="text-xl">💖</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-playful bg-clip-text text-transparent">
              智能记账本
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">
              欢迎，{user.user_metadata?.name || user.email}
            </span>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        className="container mx-auto px-4 py-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)' }}
      >
        {children}
      </main>

      {/* Floating Action Button */}
      {onAddTransaction && (
        <Button
          onClick={onAddTransaction}
          className="fixed right-6 h-16 w-16 rounded-full shadow-money bg-gradient-playful hover:shadow-elevated hover:scale-110 transition-all duration-300 md:bottom-6 bottom-[calc(env(safe-area-inset-bottom,0px)+80px)] animate-bounce"
          size="icon"
        >
          <Plus className="h-8 w-8" />
        </Button>
      )}

      {/* Bottom Navigation (Mobile) */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-gradient-soft border-t md:hidden shadow-soft"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex justify-around py-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`flex flex-col gap-1 h-auto py-3 flex-1 rounded-2xl transition-all duration-300 ${location.pathname === '/' ? 'bg-primary-light text-primary shadow-cute' : 'hover:bg-primary-soft'}`}
            onClick={() => navigate('/')}
          >
            <BookOpen className="h-5 w-5" />
            <span className="text-xs font-medium">💝 账本</span>
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className={`flex flex-col gap-1 h-auto py-3 flex-1 rounded-2xl transition-all duration-300 ${location.pathname === '/statistics' ? 'bg-accent-light text-accent shadow-cute' : 'hover:bg-accent-soft'}`}
            onClick={() => navigate('/statistics')}
          >
            <BarChart3 className="h-5 w-5" />
            <span className="text-xs font-medium">📊 统计</span>
          </Button>
        </div>
      </nav>
    </div>
  );
};

export default AppLayout;
