import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useApp } from "@/store/appContext";
import AdminLayout from "@/layouts/AdminLayout";
import Login from "@/pages/Login";
import Setup from "@/pages/Setup";
import Dashboard from "@/pages/Dashboard";
import KeyBrowser from "@/pages/KeyBrowser";
import CLI from "@/pages/CLI";
import Monitor from "@/pages/Monitor";
import PubSub from "@/pages/PubSub";
import SlowLog from "@/pages/SlowLog";
import MemoryAnalysis from "@/pages/MemoryAnalysis";
import ServerInfo from "@/pages/ServerInfo";
import ACLManager from "@/pages/ACLManager";
import ImportExport from "@/pages/ImportExport";
import Connections from "@/pages/Connections";
import Settings from "@/pages/Settings";
import Diagnostics from "@/pages/Diagnostics";
import ConnectedClients from "@/pages/ConnectedClients";
import ConfigEditor from "@/pages/ConfigEditor";
import TTLManager from "@/pages/TTLManager";
import CommandProfiler from "@/pages/CommandProfiler";
import KeyspaceEvents from "@/pages/KeyspaceEvents";
import GlobalSearch from "@/pages/GlobalSearch";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { isAuthenticated } = useApp();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AdminLayout />;
}


function AppRoutes() {
  const { isAuthenticated, checkSetup } = useApp();
  const [setupStatus, setSetupStatus] = useState<'checking' | 'needed' | 'complete' | 'error'>('checking');
  const [isLoading, setIsLoading] = useState(true);

  // Check setup status on mount
  useEffect(() => {
    const checkSetupStatus = async () => {
      try {
        setIsLoading(true);
        const needsSetup = await checkSetup();
        setSetupStatus(needsSetup ? 'needed' : 'complete');
      } catch (error) {
        console.error('Failed to check setup status:', error);
        setSetupStatus('error');
      } finally {
        setIsLoading(false);
      }
    };

    checkSetupStatus();
  }, [checkSetup]);

  // Show loading indicator while checking setup status
  if (isLoading || setupStatus === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(220,25%,8%)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[hsl(220,10%,50%)]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route 
        path="/setup" 
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : setupStatus === 'needed' ? (
            <Setup />
          ) : (
            <Navigate to="/login" replace />
          )
        } 
      />
      <Route 
        path="/login" 
        element={
          isAuthenticated ? (
            <Navigate to="/dashboard" replace />
          ) : setupStatus === 'needed' ? (
            <Navigate to="/setup" replace />
          ) : (
            <Login />
          )
        } 
      />
      <Route path="/" element={<ProtectedRoutes />}>
        <Route 
          index 
          element={
            setupStatus === 'needed' ? (
              <Navigate to="/setup" replace />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          } 
        />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="keys" element={<KeyBrowser />} />
        <Route path="cli" element={<CLI />} />
        <Route path="monitor" element={<Monitor />} />
        <Route path="pubsub" element={<PubSub />} />
        <Route path="slowlog" element={<SlowLog />} />
        <Route path="memory" element={<MemoryAnalysis />} />
        <Route path="diagnostics" element={<Diagnostics />} />
        <Route path="clients" element={<ConnectedClients />} />
        <Route path="config" element={<ConfigEditor />} />
        <Route path="ttl" element={<TTLManager />} />
        <Route path="profiler" element={<CommandProfiler />} />
        <Route path="keyspace" element={<KeyspaceEvents />} />
        <Route path="search" element={<GlobalSearch />} />
        <Route path="server" element={<ServerInfo />} />
        <Route path="acl" element={<ACLManager />} />
        <Route path="import-export" element={<ImportExport />} />
        <Route path="connections" element={<Connections />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
