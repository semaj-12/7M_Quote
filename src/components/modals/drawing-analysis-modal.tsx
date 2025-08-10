import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, EyeOff, RotateCcw, CheckCircle } from "lucide-react";

interface Highlight {
  id: string;
  type: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  partCategory: string;
  isVisible: boolean;
  isUserModified: boolean;
}

interface DrawingAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (confirmedHighlights: Highlight[]) => void;
  drawingName: string;
  selectedParts: string[];
  drawingUrl?: string;
}

// Mock AI-generated highlights for demonstration
const MOCK_HIGHLIGHTS: Highlight[] = [
  {
    id: "h1",
    type: "W-Beam",
    description: "W12x26 beam, 24'-6\" long",
    x: 100,
    y: 150,
    width: 400,
    height: 30,
    confidence: 0.95,
    partCategory: "structural_steel",
    isVisible: true,
    isUserModified: false,
  },
  {
    id: "h2", 
    type: "Dimension",
    description: "Overall length: 24'-6\"",
    x: 250,
    y: 100,
    width: 100,
    height: 20,
    confidence: 0.92,
    partCategory: "structural_steel",
    isVisible: true,
    isUserModified: false,
  },
  {
    id: "h3",
    type: "Weld Symbol",
    description: "Fillet weld 3/16\"",
    x: 180,
    y: 200,
    width: 25,
    height: 25,
    confidence: 0.88,
    partCategory: "hardware",
    isVisible: true,
    isUserModified: false,
  },
  {
    id: "h4",
    type: "Steel Plate",
    description: "Base plate 12\"x12\"x1/2\"",
    x: 450,
    y: 170,
    width: 80,
    height: 40,
    confidence: 0.89,
    partCategory: "sheet_metal",
    isVisible: true,
    isUserModified: false,
  },
];

export default function DrawingAnalysisModal({
  isOpen,
  onClose,
  onConfirm,
  drawingName,
  selectedParts,
  drawingUrl = "/api/placeholder-drawing.png",
}: DrawingAnalysisModalProps) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Simulate AI analysis
  useEffect(() => {
    if (isOpen) {
      setIsAnalyzing(true);
      setTimeout(() => {
        // Filter highlights based on selected parts
        const filteredHighlights = MOCK_HIGHLIGHTS.filter(h => 
          selectedParts.includes(h.partCategory)
        );
        setHighlights(filteredHighlights);
        setIsAnalyzing(false);
      }, 3000);
    }
  }, [isOpen, selectedParts]);

  // Draw highlights on canvas
  useEffect(() => {
    if (!isAnalyzing && canvasRef.current && imageRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw highlights
      highlights.forEach((highlight) => {
        if (!highlight.isVisible) return;

        const color = highlight.isUserModified ? "#f59e0b" : "#3b82f6";
        
        // Draw highlight box
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(highlight.x, highlight.y, highlight.width, highlight.height);
        
        // Draw confidence indicator
        ctx.fillStyle = `${color}33`;
        ctx.fillRect(highlight.x, highlight.y, highlight.width, highlight.height);
        
        // Draw label
        ctx.fillStyle = color;
        ctx.font = "12px sans-serif";
        ctx.fillText(
          highlight.type,
          highlight.x + 5,
          highlight.y - 5
        );
      });
    }
  }, [highlights, isAnalyzing]);

  const toggleHighlight = (id: string) => {
    setHighlights(prev =>
      prev.map(h =>
        h.id === id ? { ...h, isVisible: !h.isVisible, isUserModified: true } : h
      )
    );
  };

  const resetHighlights = () => {
    setHighlights(prev =>
      prev.map(h => ({ ...h, isVisible: true, isUserModified: false }))
    );
  };

  const handleConfirm = () => {
    onConfirm(highlights.filter(h => h.isVisible));
    onClose();
  };

  const visibleHighlights = highlights.filter(h => h.isVisible);
  const hiddenHighlights = highlights.filter(h => !h.isVisible);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[90vh]">
        <DialogHeader>
          <DialogTitle>AI Drawing Analysis - {drawingName}</DialogTitle>
          <p className="text-sm text-gray-600">
            Review the AI's analysis and adjust highlighting as needed before generating your quote.
          </p>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-3 gap-6 min-h-0">
          {/* Drawing Display */}
          <div className="col-span-2 relative">
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Drawing Analysis</h3>
                  {isAnalyzing ? (
                    <Badge variant="secondary" className="animate-pulse">
                      Analyzing...
                    </Badge>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge variant="default">
                        {visibleHighlights.length} items found
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={resetHighlights}
                        disabled={highlights.length === 0}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Reset
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="h-full">
                <div className="relative h-full bg-gray-50 rounded border overflow-hidden">
                  {isAnalyzing ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600">AI analyzing drawing...</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <img
                        ref={imageRef}
                        src={drawingUrl}
                        alt="Engineering Drawing"
                        className="w-full h-full object-contain"
                        onLoad={() => {
                          if (canvasRef.current && imageRef.current) {
                            const canvas = canvasRef.current;
                            canvas.width = imageRef.current.naturalWidth;
                            canvas.height = imageRef.current.naturalHeight;
                          }
                        }}
                      />
                      <canvas
                        ref={canvasRef}
                        className="absolute top-0 left-0 w-full h-full pointer-events-none"
                        style={{ mixBlendMode: "multiply" }}
                      />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Analysis Results */}
          <div className="space-y-4">
            <Tabs defaultValue="found" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="found">
                  Found ({visibleHighlights.length})
                </TabsTrigger>
                <TabsTrigger value="hidden">
                  Hidden ({hiddenHighlights.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="found" className="space-y-2 max-h-80 overflow-y-auto">
                {visibleHighlights.map((highlight) => (
                  <Card key={highlight.id} className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-medium">{highlight.type}</h4>
                          <Badge variant="outline" className="text-xs">
                            {Math.round(highlight.confidence * 100)}%
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600 mb-2">
                          {highlight.description}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                          {highlight.partCategory.replace('_', ' ')}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleHighlight(highlight.id)}
                        className="ml-2"
                      >
                        <EyeOff className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
                {visibleHighlights.length === 0 && !isAnalyzing && (
                  <div className="text-center py-8 text-gray-500">
                    <EyeOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No visible highlights</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="hidden" className="space-y-2 max-h-80 overflow-y-auto">
                {hiddenHighlights.map((highlight) => (
                  <Card key={highlight.id} className="p-3 opacity-60">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-medium">{highlight.type}</h4>
                          <Badge variant="outline" className="text-xs">
                            {Math.round(highlight.confidence * 100)}%
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600 mb-2">
                          {highlight.description}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                          {highlight.partCategory.replace('_', ' ')}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleHighlight(highlight.id)}
                        className="ml-2"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
                {hiddenHighlights.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">All highlights visible</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <p className="text-sm text-gray-500">
            {visibleHighlights.length} of {highlights.length} items will be included in quote
          </p>
          <div className="space-x-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={isAnalyzing || visibleHighlights.length === 0}>
              {isAnalyzing ? "Processing..." : "Generate Quote"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}