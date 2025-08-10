import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Building2, MapPin, Users, DollarSign, Link2, Check, X, Loader2 } from "lucide-react";
import IBeam from "@/components/icons/welding-hood";
import { oauthClient, SUPPORTED_PROVIDERS } from "@/lib/oauth-client";
import { geoClient, type GeoLocationResult } from "@/lib/geo-client";

interface OnboardingProps {
  userInfo: {
    firstName: string;
    lastName: string;
    email: string;
    companyName: string;
  };
  onComplete: () => void;
}

export default function Onboarding({ userInfo, onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [connectingProviders, setConnectingProviders] = useState<Set<string>>(new Set());
  const [geocodingAddress, setGeocodingAddress] = useState(false);
  const [geoLocationResult, setGeoLocationResult] = useState<GeoLocationResult | null>(null);
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    // Pre-filled from signup
    firstName: userInfo.firstName,
    lastName: userInfo.lastName,
    companyName: userInfo.companyName,
    // Company Address
    streetAddress: "",
    city: "",
    state: "",
    zipCode: "",
    country: "United States",
    // Company Details
    employeeCount: "",
    yearEstablished: "",
    specialties: "",
    // Pricing Structure
    laborRate: "",
    overheadPercentage: "",
    profitMargin: "",
    currency: "USD",
    // Software Integrations
    bookkeepingSoftware: "",
    bookkeepingConnected: false,
    payrollSoftware: "",
    payrollConnected: false
  });

  const totalSteps = 3;
  const progress = (currentStep / totalSteps) * 100;

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      // Validate and geocode address before moving to step 2
      await validateAndGeocodeAddress();
    }
    
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const validateAndGeocodeAddress = async () => {
    const { streetAddress, city, state, zipCode, country } = formData;
    
    if (!streetAddress || !city || !state || !zipCode) {
      toast({
        title: "Address Required",
        description: "Please fill in all address fields for accurate material pricing.",
        variant: "destructive",
      });
      return;
    }

    setGeocodingAddress(true);
    
    try {
      const fullAddress = geoClient.formatAddress({
        street: streetAddress,
        city,
        state,
        zipCode,
        country
      });
      
      const result = await geoClient.geocodeAddress(fullAddress);
      setGeoLocationResult(result);
      
      const accuracy = geoClient.calculateAccuracyScore(result);
      const pricingImpact = geoClient.getRegionalPricingImpact(result);
      
      toast({
        title: "Address Verified",
        description: `${accuracy.level.toUpperCase()} accuracy (${accuracy.score}%) - ${pricingImpact.zone} pricing zone`,
        variant: accuracy.level === 'excellent' || accuracy.level === 'good' ? "default" : "destructive"
      });
      
      if (accuracy.level === 'poor') {
        toast({
          title: "Address Accuracy Warning",
          description: "Low accuracy detected. Consider verifying your address for precise material pricing.",
          variant: "destructive"
        });
      }
      
    } catch (error: any) {
      console.error('Geocoding failed:', error);
      toast({
        title: "Address Validation Failed",
        description: "Could not verify address. You can continue, but material pricing may be less accurate.",
        variant: "destructive"
      });
    } finally {
      setGeocodingAddress(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSoftwareConnect = async (type: 'bookkeeping' | 'payroll', software: string) => {
    console.log(`Connecting to ${software} for ${type}`);
    
    setConnectingProviders(prev => new Set([...prev, software]));
    
    try {
      await oauthClient.initiateOAuth(software);
      
      // Check connection status after OAuth
      const status = await oauthClient.checkConnectionStatus(software);
      
      if (status.connected) {
        if (type === 'bookkeeping') {
          setFormData(prev => ({ ...prev, bookkeepingConnected: true }));
        } else {
          setFormData(prev => ({ ...prev, payrollConnected: true }));
        }
        
        toast({
          title: "Connection Successful",
          description: `Successfully connected to ${SUPPORTED_PROVIDERS.find(p => p.id === software)?.name}`,
        });
      }
    } catch (error: any) {
      console.error(`OAuth connection failed:`, error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to the service",
        variant: "destructive",
      });
    } finally {
      setConnectingProviders(prev => {
        const newSet = new Set(prev);
        newSet.delete(software);
        return newSet;
      });
    }
  };

  // Listen for OAuth events
  useEffect(() => {
    const handleOAuthSuccess = (event: CustomEvent) => {
      const { provider } = event.detail;
      toast({
        title: "Connection Successful",
        description: `Successfully connected to ${SUPPORTED_PROVIDERS.find(p => p.id === provider)?.name}`,
      });
    };

    const handleOAuthError = (event: CustomEvent) => {
      const { provider, error } = event.detail;
      toast({
        title: "Connection Failed",
        description: error || "Failed to connect to the service",
        variant: "destructive",
      });
    };

    window.addEventListener('oauth-success', handleOAuthSuccess as EventListener);
    window.addEventListener('oauth-error', handleOAuthError as EventListener);

    return () => {
      window.removeEventListener('oauth-success', handleOAuthSuccess as EventListener);
      window.removeEventListener('oauth-error', handleOAuthError as EventListener);
    };
  }, [toast]);

  const handleComplete = async () => {
    setIsLoading(true);
    // TODO: Save company information to database
    console.log("Saving company info:", formData);
    
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      onComplete();
    }, 1000);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <Building2 className="h-12 w-12 text-primary mx-auto mb-3" />
              <h2 className="text-xl font-semibold">Company Information</h2>
              <p className="text-gray-600">Let's set up your company profile</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange("firstName", e.target.value)}
                  disabled
                  className="bg-gray-50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange("lastName", e.target.value)}
                  disabled
                  className="bg-gray-50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={formData.companyName}
                onChange={(e) => handleInputChange("companyName", e.target.value)}
                placeholder="Your Fabrication Company"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employeeCount">Number of Employees</Label>
                <Select value={formData.employeeCount} onValueChange={(value) => handleInputChange("employeeCount", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-5">1-5 employees</SelectItem>
                    <SelectItem value="6-15">6-15 employees</SelectItem>
                    <SelectItem value="16-50">16-50 employees</SelectItem>
                    <SelectItem value="51-100">51-100 employees</SelectItem>
                    <SelectItem value="100+">100+ employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="yearEstablished">Year Established</Label>
                <Input
                  id="yearEstablished"
                  type="number"
                  value={formData.yearEstablished}
                  onChange={(e) => handleInputChange("yearEstablished", e.target.value)}
                  placeholder="2010"
                  min="1900"
                  max={new Date().getFullYear()}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="specialties">Specialties (Optional)</Label>
              <Textarea
                id="specialties"
                value={formData.specialties}
                onChange={(e) => handleInputChange("specialties", e.target.value)}
                placeholder="Structural steel, custom fabrication, welding services..."
                rows={3}
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <MapPin className="h-12 w-12 text-primary mx-auto mb-3" />
              <h2 className="text-xl font-semibold">Company Address</h2>
              <p className="text-gray-600">Where is your company located?</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="streetAddress">Street Address</Label>
              <Input
                id="streetAddress"
                value={formData.streetAddress}
                onChange={(e) => handleInputChange("streetAddress", e.target.value)}
                placeholder="123 Industrial Drive"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleInputChange("city", e.target.value)}
                  placeholder="Houston"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => handleInputChange("state", e.target.value)}
                  placeholder="TX"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="zipCode">ZIP Code</Label>
                <Input
                  id="zipCode"
                  value={formData.zipCode}
                  onChange={(e) => handleInputChange("zipCode", e.target.value)}
                  placeholder="77001"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Select value={formData.country} onValueChange={(value) => handleInputChange("country", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="United States">United States</SelectItem>
                    <SelectItem value="Canada">Canada</SelectItem>
                    <SelectItem value="Mexico">Mexico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Geo-location Status Display */}
            {geoLocationResult && (
              <div className="mt-6 p-4 border rounded-lg bg-slate-50">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-800">Address Verified</span>
                  <div className="ml-auto">
                    {(() => {
                      const accuracy = geoClient.calculateAccuracyScore(geoLocationResult);
                      const colorClass = {
                        excellent: 'bg-green-100 text-green-800',
                        good: 'bg-blue-100 text-blue-800',
                        fair: 'bg-yellow-100 text-yellow-800',
                        poor: 'bg-red-100 text-red-800'
                      }[accuracy.level];
                      
                      return (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
                          {accuracy.score}% Accuracy
                        </span>
                      );
                    })()}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Pricing Zone:</span>
                    <div className="font-medium">{geoLocationResult.regionalPricingZone}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Closest Steel Hub:</span>
                    <div className="font-medium">
                      {geoClient.getClosestSteelHub(geoLocationResult).hubName}
                      <span className="text-gray-500 ml-1">
                        ({geoClient.getClosestSteelHub(geoLocationResult).distance} mi)
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600">Transport Impact:</span>
                    <div className="font-medium">
                      {(() => {
                        const impact = geoClient.getRegionalPricingImpact(geoLocationResult);
                        const colorClass = {
                          minimal: 'text-green-600',
                          moderate: 'text-blue-600',
                          significant: 'text-yellow-600',
                          high: 'text-red-600'
                        }[impact.transportImpact];
                        
                        return (
                          <span className={colorClass}>
                            {impact.transportImpact.charAt(0).toUpperCase() + impact.transportImpact.slice(1)}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600">Est. Delivery:</span>
                    <div className="font-medium">
                      {geoClient.estimateDeliveryTime(geoLocationResult, 'standard').days} days
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <DollarSign className="h-12 w-12 text-primary mx-auto mb-3" />
              <h2 className="text-xl font-semibold">Pricing Structure</h2>
              <p className="text-gray-600">Set your default pricing parameters</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="laborRate">Average Labor Rate ($/hour)</Label>
                <Input
                  id="laborRate"
                  type="number"
                  value={formData.laborRate}
                  onChange={(e) => handleInputChange("laborRate", e.target.value)}
                  placeholder="45"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select value={formData.currency} onValueChange={(value) => handleInputChange("currency", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="CAD">CAD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="overheadPercentage">Overhead Percentage (%)</Label>
                <Input
                  id="overheadPercentage"
                  type="number"
                  value={formData.overheadPercentage}
                  onChange={(e) => handleInputChange("overheadPercentage", e.target.value)}
                  placeholder="15"
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profitMargin">Profit Margin (%)</Label>
                <Input
                  id="profitMargin"
                  type="number"
                  value={formData.profitMargin}
                  onChange={(e) => handleInputChange("profitMargin", e.target.value)}
                  placeholder="20"
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>
            </div>

            <div className="space-y-4 border-t pt-6">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Software Integrations
              </h3>
              
              {/* Bookkeeping Software */}
              <div className="space-y-3">
                <Label>Bookkeeping Software (Optional)</Label>
                <div className="grid grid-cols-1 gap-3">
                  <Select value={formData.bookkeepingSoftware} onValueChange={(value) => handleInputChange("bookkeepingSoftware", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your bookkeeping software" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quickbooks">QuickBooks</SelectItem>
                      <SelectItem value="xero">Xero</SelectItem>
                      <SelectItem value="netsuite">NetSuite</SelectItem>
                      <SelectItem value="sage">Sage</SelectItem>
                      <SelectItem value="freshbooks">FreshBooks</SelectItem>
                      <SelectItem value="none">None / Manual Entry</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {formData.bookkeepingSoftware && formData.bookkeepingSoftware !== "none" && (
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${formData.bookkeepingConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className="text-sm">
                          {formData.bookkeepingConnected ? 'Connected' : 'Not Connected'}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={formData.bookkeepingConnected ? "outline" : "default"}
                        onClick={() => handleSoftwareConnect('bookkeeping', formData.bookkeepingSoftware)}
                        disabled={connectingProviders.has(formData.bookkeepingSoftware)}
                      >
                        {connectingProviders.has(formData.bookkeepingSoftware) ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          formData.bookkeepingConnected ? 'Reconnect' : 'Connect'
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Payroll Software */}
              <div className="space-y-3">
                <Label>Payroll Software (Optional)</Label>
                <div className="grid grid-cols-1 gap-3">
                  <Select value={formData.payrollSoftware} onValueChange={(value) => handleInputChange("payrollSoftware", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your payroll software" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="adp">ADP</SelectItem>
                      <SelectItem value="paychex">Paychex</SelectItem>
                      <SelectItem value="gusto">Gusto</SelectItem>
                      <SelectItem value="paylocity">Paylocity</SelectItem>
                      <SelectItem value="quickbooks-payroll">QuickBooks Payroll</SelectItem>
                      <SelectItem value="none">None / Manual Entry</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {formData.payrollSoftware && formData.payrollSoftware !== "none" && (
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${formData.payrollConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className="text-sm">
                          {formData.payrollConnected ? 'Connected' : 'Not Connected'}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={formData.payrollConnected ? "outline" : "default"}
                        onClick={() => handleSoftwareConnect('payroll', formData.payrollSoftware)}
                        disabled={connectingProviders.has(formData.payrollSoftware)}
                      >
                        {connectingProviders.has(formData.payrollSoftware) ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          formData.payrollConnected ? 'Reconnect' : 'Connect'
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> These values can be adjusted later in your company settings. 
                Software integrations help improve quote accuracy by using your historical data.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-primary rounded-lg">
              <IBeam className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">7M Quote</h1>
          <p className="text-gray-600 mt-2">Complete your company setup</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl">Company Setup</CardTitle>
              <span className="text-sm text-gray-500">Step {currentStep} of {totalSteps}</span>
            </div>
            <Progress value={progress} className="w-full" />
          </CardHeader>
          <CardContent className="space-y-6">
            {renderStep()}

            <div className="flex justify-between pt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 1}
              >
                Back
              </Button>
              
              {currentStep < totalSteps ? (
                <Button 
                  onClick={handleNext}
                  disabled={geocodingAddress}
                >
                  {geocodingAddress ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validating Address...
                    </>
                  ) : (
                    'Next'
                  )}
                </Button>
              ) : (
                <Button onClick={handleComplete} disabled={isLoading}>
                  {isLoading ? "Setting up..." : "Complete Setup"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}