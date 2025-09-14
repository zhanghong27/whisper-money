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
      <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <span className="text-lg">💰</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              智慧记账
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
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>

      {/* Floating Action Button */}
      {onAddTransaction && (
        <Button
          onClick={onAddTransaction}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-money bg-gradient-primary hover:shadow-elevated"
          size="icon"
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}

      {/* Bottom Navigation (Mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t md:hidden">
        <div className="flex justify-around py-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`flex flex-col gap-1 h-auto py-2 flex-1 ${location.pathname === '/' ? 'bg-muted' : ''}`}
            onClick={() => navigate('/')}
          >
            <BookOpen className="h-4 w-4" />
            <span className="text-xs">账本</span>
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className={`flex flex-col gap-1 h-auto py-2 flex-1 ${location.pathname === '/statistics' ? 'bg-muted' : ''}`}
            onClick={() => navigate('/statistics')}
          >
            <BarChart3 className="h-4 w-4" />
            <span className="text-xs">统计</span>
          </Button>
        </div>
      </nav>
    </div>
  );
};

export default AppLayout;