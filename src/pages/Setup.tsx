import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/store/appContext";
import {Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface SetupState {
  username: string;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
  error: string;
  isSubmitting: boolean;
  validationErrors: {
    username?: string;
    password?: string;
    confirmPassword?: string;
  };
}

export default function Setup() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{
    username?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const { setup } = useApp();
  const navigate = useNavigate();

  const validateForm = (): boolean => {
    const errors: {
      username?: string;
      password?: string;
      confirmPassword?: string;
    } = {};

    if (!username || username.trim() === "") {
      errors.username = "Username is required";
    }

    if (password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords must match";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const clearError = () => {
    setError("");
    setValidationErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent concurrent submissions
    if (isSubmitting) {
      return;
    }

    // Validate form
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const success = await setup(username, password);
      if (success) {
        // Show brief success message before redirect
        setError("");
        // Navigation will be handled by routing logic when auth state changes
        navigate("/dashboard");
      } else {
        setError("Failed to create admin account. Please try again.");
      }
    } catch (err: any) {
      // Handle specific error cases
      const errorMessage = err?.message || err?.toString() || "";
      
      if (errorMessage.includes("Setup already completed")) {
        setError("Setup already completed");
      } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
        setError("Connection failed. Please check your network and try again.");
      } else if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
        setError("Too many attempts. Please try again later.");
      } else {
        setError("Failed to create admin account. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = username.trim() !== "" && password.length >= 8 && password === confirmPassword;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(220,25%,8%)]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(4,74%,49%,0.08),transparent_50%)]" />
      <Card className="w-full max-w-sm relative border-[hsl(220,20%,18%)] bg-[hsl(220,25%,11%)]">
        <CardContent className="pt-8 pb-6 px-6">
          <div className="flex flex-col items-center mb-8">
            <img 
              src="/rediscover_logo_transparent.png" 
              alt="Rediscover" 
              className="w-16 h-16 mb-3"
            />
            <h1 className="text-xl font-bold text-[hsl(0,0%,95%)]">Initial Setup</h1>
            <p className="text-xs text-[hsl(220,10%,50%)] mt-1">Create your administrator account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" aria-label="Setup form">
            <div>
              <label htmlFor="username" className="text-xs text-[hsl(220,10%,60%)] mb-1 block">Username</label>
              <Input
                id="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  clearError();
                }}
                className="bg-[hsl(220,20%,14%)] border-[hsl(220,20%,20%)] text-[hsl(0,0%,90%)] h-9"
                placeholder="admin"
                disabled={isSubmitting}
              />
              {validationErrors.username && (
                <p className="text-xs text-status-error mt-1">{validationErrors.username}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="text-xs text-[hsl(220,10%,60%)] mb-1 block">Password</label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError();
                  }}
                  className="bg-[hsl(220,20%,14%)] border-[hsl(220,20%,20%)] text-[hsl(0,0%,90%)] h-9 pr-9"
                  placeholder="••••••••"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[hsl(220,10%,50%)]"
                  disabled={isSubmitting}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {validationErrors.password && (
                <p className="text-xs text-status-error mt-1">{validationErrors.password}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="text-xs text-[hsl(220,10%,60%)] mb-1 block">Confirm Password</label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    clearError();
                  }}
                  className="bg-[hsl(220,20%,14%)] border-[hsl(220,20%,20%)] text-[hsl(0,0%,90%)] h-9 pr-9"
                  placeholder="••••••••"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[hsl(220,10%,50%)]"
                  disabled={isSubmitting}
                  aria-label="Toggle confirm password visibility"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {validationErrors.confirmPassword && (
                <p className="text-xs text-status-error mt-1">{validationErrors.confirmPassword}</p>
              )}
            </div>

            {error && (
              <div className="text-xs text-status-error">
                {error}
                {error === "Setup already completed" && (
                  <span>
                    {" "}
                    <a href="/login" className="underline">Go to login</a>
                  </span>
                )}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-9" 
              disabled={!isFormValid || isSubmitting}
            >
              {isSubmitting ? "Creating Account..." : "Create Admin Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
