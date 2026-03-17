import { Outlet, useLocation, Link } from "react-router-dom";
import { useApp } from "@/store/appContext";
import {
  LayoutDashboard, Search, Terminal, Radio, MessageSquare, Clock,
  HardDrive, Shield, Settings, Database, FileDown, Server,
  ChevronLeft, ChevronRight, Zap, LogOut, User, Users, Sliders,
  Activity, Globe
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UpdateBanner } from "@/components/UpdateBanner";

const navSections = [
  {
    title: "MAIN",
    items: [
      { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { path: "/keys", label: "Key Browser", icon: Search },
      { path: "/search", label: "Global Search", icon: Globe },
    ]
  },
  {
    title: "MONITORING", 
    items: [
      { path: "/monitor", label: "Monitor", icon: Radio },
      { path: "/profiler", label: "Command Profiler", icon: Activity },
      { path: "/pubsub", label: "Pub/Sub", icon: MessageSquare },
      { path: "/keyspace", label: "Keyspace Events", icon: Zap },
    ]
  },
  {
    title: "ANALYSIS",
    items: [
      { path: "/slowlog", label: "Slow Log", icon: Clock },
      { path: "/memory", label: "Memory", icon: HardDrive },
      { path: "/ttl", label: "TTL Manager", icon: Clock },
      { path: "/diagnostics", label: "Diagnostics", icon: Zap },
    ]
  },
  {
    title: "MANAGEMENT",
    items: [
      { path: "/acl", label: "ACL Manager", icon: Shield },
      { path: "/config", label: "Config Editor", icon: Sliders },
      { path: "/clients", label: "Connected Clients", icon: Users },
      { path: "/server", label: "Server Info", icon: Server },
    ]
  },
  {
    title: "DATA",
    items: [
      { path: "/import-export", label: "Import/Export", icon: FileDown },
      { path: "/cli", label: "CLI Terminal", icon: Terminal },
    ]
  },
  {
    title: "SYSTEM",
    items: [
      { path: "/connections", label: "Connections", icon: Database },
      { path: "/settings", label: "Settings", icon: Settings },
    ]
  }
];

export default function AdminLayout() {
  const {
    sidebarOpen, setSidebarOpen,
    connections, activeConnectionId, setActiveConnectionId,
    activeDb, setActiveDb,
    username, role, logout
  } = useApp();
  const location = useLocation();

  const activeConnection = connections.find(c => c.id === activeConnectionId);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "flex flex-col bg-[hsl(var(--sidebar-bg))] text-[hsl(var(--sidebar-fg))] transition-all duration-300 border-r border-[hsl(var(--sidebar-border))]",
        sidebarOpen ? "w-60" : "w-14"
      )}>
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 h-14 border-b border-[hsl(var(--sidebar-border))]">
          {sidebarOpen ? (
            <>
              <img 
                src="/rediscover_logo_transparent.png" 
                alt="Rediscover" 
                className="w-8 h-8 object-contain"
              />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-bold text-[hsl(0,0%,95%)] truncate">
                  Rediscover
                </span>
                <span className="text-[10px] text-[hsl(var(--sidebar-fg))]">
                  v1.0.0
                </span>
              </div>
            </>
          ) : (
            <img 
              src="/rediscover_logo_transparent.png" 
              alt="Rediscover" 
              className="w-8 h-8 mx-auto object-contain"
            />
          )}
        </div>

        {/* DB Selector */}
        {sidebarOpen && (
          <div className="px-3 py-2 border-b border-[hsl(var(--sidebar-border))]">
            <p className="text-[10px] uppercase tracking-wider mb-1 text-[hsl(var(--sidebar-fg))]">
              Database
            </p>
            <div className="grid grid-cols-4 gap-1">
              {Array.from({ length: 16 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveDb(i)}
                  className={cn(
                    "text-[10px] py-0.5 rounded font-mono transition-colors",
                    activeDb === i
                      ? "bg-primary text-primary-foreground"
                      : "text-[hsl(var(--sidebar-fg))] hover:bg-[hsl(var(--sidebar-hover))]"
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 py-2 overflow-y-auto scrollbar-thin">
          {navSections.map((section) => (
            <div key={section.title} className="mb-4">
              {sidebarOpen && (
                <div className="px-3 mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-[hsl(220,10%,40%)] font-medium">
                    {section.title}
                  </p>
                </div>
              )}
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-3 mx-1 px-3 py-2 text-sm rounded-md transition-colors",
                      isActive
                        ? "bg-primary/15 text-primary font-medium"
                        : "hover:bg-[hsl(var(--sidebar-hover))] text-[hsl(var(--sidebar-fg))]"
                    )}
                    title={!sidebarOpen ? item.label : undefined}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {sidebarOpen && (
                      <span className="truncate">
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex items-center justify-center h-10 border-t border-[hsl(var(--sidebar-border))] hover:bg-[hsl(var(--sidebar-hover))] transition-colors"
        >
          {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 h-14 border-b bg-card">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Select
              value={activeConnectionId || ""}
              onValueChange={setActiveConnectionId}
            >
              <SelectTrigger className="w-56 h-8 text-xs">
                <SelectValue placeholder="Select connection" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        c.status === "online" ? "bg-status-success"
                          : c.status === "slow" ? "bg-status-warning"
                          : c.status === "offline" ? "bg-status-error"
                          : "bg-muted-foreground"
                      )} />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeConnection && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="h-5 text-[10px]">
                  DB {activeDb}
                </Badge>
                {activeConnection.latency_ms != null && (
                  <Badge variant="outline" className="h-5 text-[10px]">
                    {activeConnection.latency_ms}ms
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={cn(
                    "h-5 text-[10px]",
                    activeConnection.status === 'online' ? 'text-status-success border-status-success/30' :
                    activeConnection.status === 'offline' ? 'text-status-error border-status-error/30' : ''
                  )}
                >
                  {activeConnection.status || 'unknown'}
                </Badge>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="h-5 text-[10px] capitalize">
              {role}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-2">
                  <User className="w-3.5 h-3.5" />
                  <span className="text-xs">
                    {username}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="w-3.5 h-3.5 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-background p-4">
          <UpdateBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
