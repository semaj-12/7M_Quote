import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import TopBar from "@/components/layout/topbar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function CompanySetup() {
  const userId = 1; // Mock user ID
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: company, isLoading } = useQuery({
    queryKey: [`/api/company/${userId}`],
  });

  const [formData, setFormData] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "USA",
    employeeCount: "",
    payrollFrequency: "bi-weekly",
    laborRate: "",
    overheadRate: "",
    profitMargin: "",
  });

  // Update form data when company data loads
  useState(() => {
    if (company) {
      setFormData({
        name: (company as any).name || "",
        address: (company as any).address || "",
        city: (company as any).city || "",
        state: (company as any).state || "",
        zipCode: (company as any).zipCode || "",
        country: (company as any).country || "USA",
        employeeCount: (company as any).employeeCount || "",
        payrollFrequency: (company as any).payrollFrequency || "bi-weekly",
        laborRate: (company as any).laborRate || "",
        overheadRate: (company as any).overheadRate || "",
        profitMargin: (company as any).profitMargin || "",
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      if ((company as any)?.id) {
        return apiRequest("PUT", `/api/company/${(company as any).id}`, { ...data, userId });
      } else {
        return apiRequest("POST", "/api/company", { ...data, userId });
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Company profile updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/company/${userId}`] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update company profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <TopBar
        title="Company Setup"
        subtitle="Configure your company profile and default rates"
      />
      
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-gray-900">Company Information</h3>
              <p className="text-sm text-gray-600">
                Set up your company profile to ensure accurate quote calculations.
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 bg-gray-200 rounded animate-pulse"></div>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <Label htmlFor="name">Company Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      placeholder="Enter your company name"
                      required
                    />
                  </div>
                  
                  {/* Address Section */}
                  <div className="space-y-4">
                    <h4 className="text-md font-medium text-gray-900">Company Address</h4>
                    <div>
                      <Label htmlFor="address">Street Address</Label>
                      <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => handleChange("address", e.target.value)}
                        placeholder="123 Main Street, Suite 100"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) => handleChange("city", e.target.value)}
                          placeholder="Houston"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="state">State</Label>
                        <Input
                          id="state"
                          value={formData.state}
                          onChange={(e) => handleChange("state", e.target.value)}
                          placeholder="TX"
                          required
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="zipCode">ZIP Code</Label>
                        <Input
                          id="zipCode"
                          value={formData.zipCode}
                          onChange={(e) => handleChange("zipCode", e.target.value)}
                          placeholder="77001"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="country">Country</Label>
                        <Input
                          id="country"
                          value={formData.country}
                          onChange={(e) => handleChange("country", e.target.value)}
                          placeholder="USA"
                          required
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      Used for precise geo-location pricing and material cost calculations
                    </p>
                  </div>

                  {/* Employee Information */}
                  <div className="space-y-4">
                    <h4 className="text-md font-medium text-gray-900">Workforce Information</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="employeeCount">Number of Employees</Label>
                        <Input
                          id="employeeCount"
                          type="number"
                          value={formData.employeeCount}
                          onChange={(e) => handleChange("employeeCount", e.target.value)}
                          placeholder="15"
                          min="1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="payrollFrequency">Payroll Frequency</Label>
                        <select
                          id="payrollFrequency"
                          value={formData.payrollFrequency}
                          onChange={(e) => handleChange("payrollFrequency", e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="weekly">Weekly</option>
                          <option value="bi-weekly">Bi-Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="laborRate">Labor Rate ($/hour)</Label>
                    <Input
                      id="laborRate"
                      type="number"
                      step="0.01"
                      value={formData.laborRate}
                      onChange={(e) => handleChange("laborRate", e.target.value)}
                      placeholder="65.00"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Average hourly rate for fabrication labor
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="overheadRate">Overhead Rate (%)</Label>
                    <Input
                      id="overheadRate"
                      type="number"
                      step="0.01"
                      value={formData.overheadRate}
                      onChange={(e) => handleChange("overheadRate", e.target.value)}
                      placeholder="35.00"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Percentage to cover facility, equipment, and administrative costs
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="profitMargin">Profit Margin (%)</Label>
                    <Input
                      id="profitMargin"
                      type="number"
                      step="0.01"
                      value={formData.profitMargin}
                      onChange={(e) => handleChange("profitMargin", e.target.value)}
                      placeholder="20.00"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Target profit margin for quotes
                    </p>
                  </div>
                  
                  <div className="flex justify-end space-x-3 pt-6">
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateMutation.isPending}
                      className="bg-primary text-white hover:bg-blue-700"
                    >
                      {updateMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>


        </div>
      </main>
    </>
  );
}
