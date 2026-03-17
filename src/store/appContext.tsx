import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { auth, connections as connectionsApi } from "@/lib/redis-api";

export interface Connection {
  id: string;
  name: string;
  color: string | null;
  status: string | null;
  latency_ms: number | null;
  is_default: boolean | null;
}

interface AppState {
  isAuthenticated: boolean;
  login: (user: string, pass: string) => Promise<boolean>;
  logout: () => void;
  setup: (user: string, pass: string) => Promise<boolean>;
  checkSetup: () => Promise<boolean>;
  username: string;
  role: "admin" | "operator" | "viewer";
  connections: Connection[];
  activeConnectionId: string | null;
  setActiveConnectionId: (id: string) => void;
  activeDb: number;
  setActiveDb: (db: number) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  refreshConnections: () => Promise<void>;
  connectionsLoading: boolean;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"admin" | "operator" | "viewer">("admin");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeConnectionId, setActiveConnectionIdState] = useState<string | null>(
    localStorage.getItem('activeConnectionId')
  );
  const [activeDb, setActiveDb] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [connectionsLoading, setConnectionsLoading] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('jwt');
      if (!token) {
        setIsAuthenticated(false);
        return;
      }

      try {
        const user = await auth.getCurrentUser();
        setIsAuthenticated(true);
        setUsername(user.username);
        setRole(user.role as "admin" | "operator" | "viewer");
      } catch (error) {
        // Token is invalid or expired
        localStorage.removeItem('jwt');
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, []);

  const loadConnections = useCallback(async () => {
    setConnectionsLoading(true);
    try {
      const data = await connectionsApi.getConnections();
      if (data) {
        // Convert number IDs to strings for compatibility
        const formattedConnections = data.map((conn: any) => ({
          id: String(conn.id),
          name: conn.name,
          color: conn.color || null,
          status: conn.status || null,
          latency_ms: conn.latencyMs || null,
          is_default: conn.isDefault || false,
        }));
        setConnections(formattedConnections);
        
        if (!activeConnectionId || !formattedConnections.find((c: Connection) => c.id === activeConnectionId)) {
          const def = formattedConnections.find((c: Connection) => c.is_default) ?? formattedConnections[0];
          if (def) {
            setActiveConnectionIdState(def.id);
            localStorage.setItem('activeConnectionId', def.id);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load connections:', e);
    } finally {
      setConnectionsLoading(false);
    }
  }, [activeConnectionId]);

  useEffect(() => {
    if (isAuthenticated) {
      loadConnections();
    }
  }, [isAuthenticated, loadConnections]);

  // Ping connections periodically
  useEffect(() => {
    if (!isAuthenticated || connections.length === 0) return;
    const pingAll = async () => {
      for (const conn of connections) {
        try {
          await connectionsApi.testConnection(Number(conn.id));
        } catch {}
      }
      await loadConnections();
    };
    const interval = setInterval(pingAll, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, connections.length, loadConnections]);

  const setActiveConnectionId = (id: string) => {
    setActiveConnectionIdState(id);
    setActiveDb(0);
    localStorage.setItem('activeConnectionId', id);
  };

  const login = async (user: string, pass: string): Promise<boolean> => {
    try {
      const response = await auth.login(user, pass);
      localStorage.setItem('jwt', response.token);
      
      // Get user info
      const userInfo = await auth.getCurrentUser();
      setIsAuthenticated(true);
      setUsername(userInfo.username);
      setRole(userInfo.role as "admin" | "operator" | "viewer");
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('jwt');
    setIsAuthenticated(false);
    setUsername("");
  };

  const setup = async (user: string, pass: string): Promise<boolean> => {
    try {
      const response = await auth.setup(user, pass);
      localStorage.setItem('jwt', response.token);
      
      // Get user info
      const userInfo = await auth.getCurrentUser();
      setIsAuthenticated(true);
      setUsername(userInfo.username);
      setRole(userInfo.role as "admin" | "operator" | "viewer");
      return true;
    } catch (error) {
      console.error('Setup failed:', error);
      return false;
    }
  };

  const checkSetup = async (): Promise<boolean> => {
    try {
      const response = await auth.checkSetup();
      return response.needsSetup;
    } catch (error) {
      console.error('Check setup failed:', error);
      return false;
    }
  };

  return (
    <AppContext.Provider value={{
      isAuthenticated, login, logout, setup, checkSetup, username, role,
      connections, activeConnectionId, setActiveConnectionId,
      activeDb, setActiveDb,
      sidebarOpen, setSidebarOpen,
      refreshConnections: loadConnections,
      connectionsLoading,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
