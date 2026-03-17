import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/store/appContext";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { login } = useApp();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Username and password are required");
      return;
    }
    const success = await login(username, password);
    if (success) navigate("/dashboard");
    else setError("Invalid credentials");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(220,25%,8%)] p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(4,74%,49%,0.08),transparent_50%)]" />
      <Card className="w-full max-w-sm relative border-[hsl(220,20%,18%)] bg-[hsl(220,25%,11%)]">
        <CardContent className="pt-8 pb-6 px-6">
          <div className="flex flex-col items-center mb-8">
            <img 
              src="/rediscover_logo_transparent.png" 
              alt="Rediscover" 
              className="w-16 h-16 mb-3"
            />
            <h1 className="text-xl font-bold text-[hsl(0,0%,95%)]">
              Rediscover
            </h1>
            <p className="text-xs text-[hsl(220,10%,50%)] mt-1 text-center">
              Sign in to manage your Redis servers
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-[hsl(220,10%,60%)] mb-1 block">
                Username
              </label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-[hsl(220,20%,14%)] border-[hsl(220,20%,20%)] text-[hsl(0,0%,90%)] h-9"
                placeholder="admin"
              />
            </div>
            <div>
              <label className="text-xs text-[hsl(220,10%,60%)] mb-1 block">
                Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-[hsl(220,20%,14%)] border-[hsl(220,20%,20%)] text-[hsl(0,0%,90%)] h-9 pr-9"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[hsl(220,10%,50%)]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-status-error">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full h-9">
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
