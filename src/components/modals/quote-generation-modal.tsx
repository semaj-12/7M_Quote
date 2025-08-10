import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, FileText, Bot, User, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  calculateAILaborHours, 
  getProjectComplexityFromDrawing, 
  extractDimensionsFromDrawingData,
  type LaborBreakdown 
} from "@/lib/ai-labor-calculator";

interface QuoteGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
  drawingId?: number;
}

export default function QuoteGenerationModal({ 
  isOpen, 
  onClose, 
  userId, 
  drawingId 
}: QuoteGenerationModalProps) {
  const [formData, setFormData] = useState({
    clientName: "",
    projectDescription: "",
    materialGrade: "A36 Steel",
    finishType: "Hot-Dip Galvanized",
    deliveryTimeline: "Standard (4-6 weeks)",
    quantity: 1,
    laborHours: 0,
  });

  const [useAILaborHours, setUseAILaborHours] = useState(true);
  const [aiLaborBreakdown, setAiLaborBreakdown] = useState<LaborBreakdown | null>(null);
  const [isCalculatingLabor, setIsCalculatingLabor] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get drawing data if drawingId is provided
  const { data: drawingData } = useQuery({
    queryKey: [`/api/drawings/${drawingId}`],
    enabled: !!drawingId,
  });

  // Calculate AI labor hours when drawing data or material changes
  useEffect(() => {
    if (useAILaborHours && (drawingData as any)?.extractedData) {
      calculateLaborHours();
    }
  }, [useAILaborHours, drawingData, formData.materialGrade, formData.finishType, formData.quantity]);

  const calculateLaborHours = async () => {
    if (!(drawingData as any)?.extractedData) return;
    
    setIsCalculatingLabor(true);
    try {
      const complexity = getProjectComplexityFromDrawing((drawingData as any).extractedData);
      const dimensions = extractDimensionsFromDrawingData((drawingData as any).extractedData);
      
      const laborBreakdown = await calculateAILaborHours({
        projectComplexity: complexity,
        materialType: formData.materialGrade,
        dimensions,
        fabricationType: 'structural',
        finishRequirements: formData.finishType,
        quantity: formData.quantity,
        companyEfficiency: 1.0 // Default efficiency factor
      });
      
      setAiLaborBreakdown(laborBreakdown);
      setFormData(prev => ({ ...prev, laborHours: laborBreakdown.total }));
    } catch (error) {
      console.error('Failed to calculate AI labor hours:', error);
      toast({
        title: "Calculation Warning",
        description: "Unable to calculate AI labor hours. Please enter manually.",
        variant: "destructive",
      });
    } finally {
      setIsCalculatingLabor(false);
    }
  };

  const quoteMutation = useMutation({
    mutationFn: async (data: any) => {
      const quoteData = {
        ...data,
        userId,
        drawingId,
        aiCalculatedLaborHours: useAILaborHours ? aiLaborBreakdown?.total : null,
        laborHoursSource: useAILaborHours ? 'ai' : 'manual'
      };
      return apiRequest("POST", "/api/quotes", quoteData);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Quote generated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/recent/${userId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${userId}`] });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate quote. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientName || !formData.projectDescription) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    quoteMutation.mutate(formData);
  };

  // Mock calculation for display
  const materialCost = 8450;
  const laborCost = formData.laborHours * 65;
  const overhead = (materialCost + laborCost) * 0.35;
  const profit = (materialCost + laborCost + overhead) * 0.20;
  const total = materialCost + laborCost + overhead + profit;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Generate Quote
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PDF Viewer Section */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Drawing Analysis</h4>
              <Card className="h-80">
                <CardContent className="h-full p-4 bg-gray-50 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <FileText className="mx-auto h-12 w-12 mb-2" />
                    <p className="text-sm">PDF Drawing will display here</p>
                    <p className="text-xs">with highlighted dimensions</p>
                  </div>
                </CardContent>
              </Card>
              <div className="mt-4 space-y-2">
                <h5 className="text-sm font-medium text-gray-900">Extracted Dimensions</h5>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>• Overall Length: 24'-6"</p>
                  <p>• Height: 8'-0"</p>
                  <p>• Beam Size: W12x26</p>
                  <p>• Column Size: W8x31</p>
                </div>
              </div>
            </div>

            {/* Quote Parameters Section */}
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">Quote Parameters</h4>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="clientName">Client Name</Label>
                  <Input
                    id="clientName"
                    value={formData.clientName}
                    onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                    placeholder="Enter client name"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="projectDescription">Project Description</Label>
                  <Input
                    id="projectDescription"
                    value={formData.projectDescription}
                    onChange={(e) => setFormData(prev => ({ ...prev, projectDescription: e.target.value }))}
                    placeholder="Brief project description"
                    required
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="materialGrade">Material Grade</Label>
                    <Select value={formData.materialGrade} onValueChange={(value) => 
                      setFormData(prev => ({ ...prev, materialGrade: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A36 Steel">A36 Steel</SelectItem>
                        <SelectItem value="A572 Grade 50">A572 Grade 50</SelectItem>
                        <SelectItem value="Stainless 304">Stainless 304</SelectItem>
                        <SelectItem value="Aluminum 6061">Aluminum 6061</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="finishType">Finish Type</Label>
                    <Select value={formData.finishType} onValueChange={(value) => 
                      setFormData(prev => ({ ...prev, finishType: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Hot-Dip Galvanized">Hot-Dip Galvanized</SelectItem>
                        <SelectItem value="Painted">Painted</SelectItem>
                        <SelectItem value="Mill Finish">Mill Finish</SelectItem>
                        <SelectItem value="Powder Coated">Powder Coated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="deliveryTimeline">Delivery Timeline</Label>
                    <Select value={formData.deliveryTimeline} onValueChange={(value) => 
                      setFormData(prev => ({ ...prev, deliveryTimeline: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Standard (4-6 weeks)">Standard (4-6 weeks)</SelectItem>
                        <SelectItem value="Rush (2-3 weeks)">Rush (2-3 weeks)</SelectItem>
                        <SelectItem value="Emergency (1 week)">Emergency (1 week)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                </div>
                
                {/* Labor Hours Section with AI/Manual Toggle */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Labor Hours</Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="useAI"
                        checked={useAILaborHours}
                        onCheckedChange={(checked) => setUseAILaborHours(checked as boolean)}
                      />
                      <Label htmlFor="useAI" className="text-sm flex items-center">
                        <Bot className="mr-1 h-3 w-3" />
                        AI Calculate
                      </Label>
                    </div>
                  </div>
                  
                  {useAILaborHours ? (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg">
                        <Bot className="h-4 w-4 text-blue-600" />
                        <span className="text-sm text-blue-800">
                          {isCalculatingLabor ? 'Calculating...' : 
                           aiLaborBreakdown ? `AI calculated: ${aiLaborBreakdown.total} hours (${Math.round(aiLaborBreakdown.confidence * 100)}% confidence)` :
                           'AI will calculate based on drawing analysis'}
                        </span>
                      </div>
                      
                      {aiLaborBreakdown && (
                        <div className="text-xs text-gray-600 space-y-1">
                          <div className="grid grid-cols-2 gap-2">
                            <span>Cutting: {aiLaborBreakdown.cutting}h</span>
                            <span>Welding: {aiLaborBreakdown.welding}h</span>
                            <span>Assembly: {aiLaborBreakdown.assembly}h</span>
                            <span>Finishing: {aiLaborBreakdown.finishing}h</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {getProjectComplexityFromDrawing((drawingData as any)?.extractedData)} complexity
                          </Badge>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4 text-gray-500" />
                        <Input
                          id="laborHours"
                          type="number"
                          step="0.1"
                          placeholder="Enter labor hours"
                          value={formData.laborHours || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, laborHours: parseFloat(e.target.value) || 0 }))}
                        />
                      </div>
                      <p className="text-xs text-gray-500">Manually enter estimated labor hours</p>
                    </div>
                  )}
                </div>
                
                {/* Calculated Results */}
                <Card className="mt-6 bg-gray-50">
                  <CardContent className="p-4">
                    <h5 className="text-sm font-medium text-gray-900 mb-3">Calculated Estimate</h5>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Material Cost:</span>
                        <span className="font-medium">${materialCost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Labor Hours:</span>
                        <span className="font-medium">{formData.laborHours} hrs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Labor Cost:</span>
                        <span className="font-medium">${laborCost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Overhead (35%):</span>
                        <span className="font-medium">${Math.round(overhead).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Profit (20%):</span>
                        <span className="font-medium">${Math.round(profit).toLocaleString()}</span>
                      </div>
                      <hr className="my-2" />
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total Quote:</span>
                        <span className="text-primary">${Math.round(total).toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </form>
            </div>
          </div>
        </div>
        
        <div className="flex justify-between px-6 py-4 border-t border-gray-200">
          <Button variant="outline">
            Save as Draft
          </Button>
          <div className="space-x-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={quoteMutation.isPending}
              className="bg-primary text-white hover:bg-blue-700"
            >
              {quoteMutation.isPending ? "Generating..." : "Generate Quote"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
