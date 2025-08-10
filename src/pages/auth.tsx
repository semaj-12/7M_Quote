import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Mail, Eye, EyeOff, Loader2 } from "lucide-react";
import { FaGoogle, FaApple, FaMicrosoft } from "react-icons/fa";
//import IBeam from "@/components/icons/welding-hood";
import { oauthClient, SOCIAL_PROVIDERS } from "@/lib/oauth-client";

interface AuthProps {
  onAuthenticated: (userData: {
    firstName: string;
    lastName: string;
    email: string;
    companyName: string;
  }) => void;
}

export default function Auth({ onAuthenticated }: AuthProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    companyName: ""
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: Implement email/password authentication
    console.log("Sign in with:", formData.email);
    // Simulate successful authentication
    setTimeout(() => {
      setIsLoading(false);
      onAuthenticated({
        firstName: "John",
        lastName: "Doe", 
        email: formData.email,
        companyName: "Steel Works LLC"
      });
    }, 1000);
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: Implement email/password registration
    console.log("Sign up with:", formData);
    // Simulate successful registration
    setTimeout(() => {
      setIsLoading(false);
      onAuthenticated({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        companyName: formData.companyName
      });
    }, 1000);
  };

  const handleOAuthSignIn = async (provider: string) => {
    console.log(`Sign in with: ${provider}`);
    setSocialLoading(provider);
    
    try {
      await oauthClient.initiateOAuth(provider);
      
      // Simulate successful OAuth sign in with mock data
      onAuthenticated({
        firstName: "John",
        lastName: "Doe", 
        email: `user@${provider}.com`,
        companyName: "Demo Company LLC"
      });
      
      toast({
        title: "Sign In Successful",
        description: `Successfully signed in with ${SOCIAL_PROVIDERS.find(p => p.id === provider)?.name}`,
      });
    } catch (error: any) {
      console.error(`OAuth sign in failed:`, error);
      toast({
        title: "Sign In Failed",
        description: error.message || "Failed to sign in with OAuth provider",
        variant: "destructive",
      });
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-primary rounded-lg">
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">7M Quote</h1>
          <p className="text-gray-600 mt-2">AI-Powered Metal Fabrication Quoting</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Welcome</CardTitle>
            <p className="text-sm text-gray-600 text-center">
              Sign in to your account or create a new one
            </p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              {/* Sign In Tab */}
              <TabsContent value="signin" className="space-y-4">
                <form onSubmit={handleEmailSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="your@email.com"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="signin-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Signing in..." : "Sign In"}
                  </Button>
                </form>

                <div className="text-center">
                  <Button variant="link" className="text-sm text-primary">
                    Forgot your password?
                  </Button>
                </div>
              </TabsContent>

              {/* Sign Up Tab */}
              <TabsContent value="signup" className="space-y-4">
                <form onSubmit={handleEmailSignUp} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        placeholder="John"
                        value={formData.firstName}
                        onChange={(e) => handleInputChange("firstName", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        placeholder="Doe"
                        value={formData.lastName}
                        onChange={(e) => handleInputChange("lastName", e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      placeholder="Your Fabrication Company"
                      value={formData.companyName}
                      onChange={(e) => handleInputChange("companyName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="your@email.com"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Creating account..." : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => handleOAuthSignIn("google")}
                  className="w-full hover:bg-red-50 border-red-200 hover:border-red-300"
                  disabled={socialLoading === "google"}
                >
                  {socialLoading === "google" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                  ) : (
                    <FaGoogle className="h-4 w-4 text-red-500" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleOAuthSignIn("apple")}
                  className="w-full hover:bg-gray-50 border-gray-200 hover:border-gray-300"
                  disabled={socialLoading === "apple"}
                >
                  {socialLoading === "apple" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-900" />
                  ) : (
                    <FaApple className="h-4 w-4 text-gray-900" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleOAuthSignIn("microsoft")}
                  className="w-full hover:bg-blue-50 border-blue-200 hover:border-blue-300"
                  disabled={socialLoading === "microsoft"}
                >
                  {socialLoading === "microsoft" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  ) : (
                    <FaMicrosoft className="h-4 w-4 text-blue-600" />
                  )}
                </Button>
              </div>
            </div>

            <div className="mt-6 text-center text-sm text-gray-600">
              By signing up, you agree to our{" "}
              <Button variant="link" className="p-0 h-auto text-sm">
                Terms of Service
              </Button>{" "}
              and{" "}
              <Button variant="link" className="p-0 h-auto text-sm">
                Privacy Policy
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}