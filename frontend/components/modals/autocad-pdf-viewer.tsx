import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from '@/lib/queryClient';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import PdfViewer from '../pdf-viewer';
import { 
  X, 
  File, 
  Save, 
  FolderOpen, 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  Square,
  Circle,
  Minus,
  Grid3X3,
  MousePointer,
  Eye,
  EyeOff,
  Cpu,
  Move,
  Bot,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  FileText,
  ExternalLink
} from "lucide-react";

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

interface AutoCADPdfViewerProps {
  isOpen: boolean;
  onClose: () => void;
  drawingName: string;
  pdfUrl?: string;
  drawingId?: number;
  onAnalysisComplete?: (highlights: Highlight[]) => void;
}

export default function AutoCADPdfViewer({
  isOpen,
  onClose,
  drawingName,
  pdfUrl: initialPdfUrl,
  drawingId,
  onAnalysisComplete
}: AutoCADPdfViewerProps) {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [activeTool, setActiveTool] = useState('select');
  const [aiAnalysisEnabled, setAiAnalysisEnabled] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [actualPdfUrl, setActualPdfUrl] = useState<string>(initialPdfUrl || '');
  const [storageType, setStorageType] = useState<'local' | 's3'>('local');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  // Fetch the actual PDF URL (S3 or local) when component mounts
  useEffect(() => {
    if (drawingId && isOpen) {
      const fetchPdfUrl = async () => {
        try {
          const response = await fetch(`/api/drawings/${drawingId}/url`);
          if (response.ok) {
            const data = await response.json();
            setActualPdfUrl(data.url);
            setStorageType(data.storageType);
            console.log(`PDF URL fetched (${data.storageType}):`, data.url);
          } else {
            // Fallback to initial URL
            setActualPdfUrl(initialPdfUrl || '');
            setStorageType('local');
          }
        } catch (error) {
          console.error('Failed to fetch PDF URL:', error);
          setActualPdfUrl(initialPdfUrl || '');
          setStorageType('local');
        }
      };
      
      fetchPdfUrl();
    } else if (initialPdfUrl) {
      setActualPdfUrl(initialPdfUrl);
    }
  }, [drawingId, isOpen, initialPdfUrl]);

  // Check AWS credentials on mount
  const { data: credentialsStatus } = useQuery({
    queryKey: ['/api/ai/validate-credentials'],
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // AI Analysis mutation
  const analyzeDrawingMutation = useMutation({
    mutationFn: async (drawingId: number) => {
      return await apiRequest(`/api/drawings/${drawingId}/analyze`, {
        method: 'POST'
      });
    },
    onSuccess: (data) => {
      setAnalysisResults(data.analysis);
      setIsAnalyzing(false);
      convertAnalysisToHighlights(data.analysis);
      toast({
        title: "Analysis Complete",
        description: "AI analysis has been completed successfully.",
      });
    },
    onError: (error) => {
      console.error('Analysis failed:', error);
      setIsAnalyzing(false);
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze the drawing. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Convert AI analysis results to highlights
  const convertAnalysisToHighlights = (analysis: any) => {
    const newHighlights: Highlight[] = [];

    // Convert dimensions to highlights
    analysis.dimensions?.forEach((dimension: any, index: number) => {
      newHighlights.push({
        id: `dimension-${index}`,
        type: 'dimension',
        description: `${dimension.value} ${dimension.unit}`,
        x: dimension.boundingBox?.x || 100 + index * 50,
        y: dimension.boundingBox?.y || 150 + index * 30,
        width: dimension.boundingBox?.width || 80,
        height: dimension.boundingBox?.height || 20,
        confidence: dimension.confidence || 0.9,
        partCategory: 'dimensions',
        isVisible: true,
        isUserModified: false
      });
    });

    // Convert weld symbols to highlights
    analysis.weldSymbols?.forEach((weld: any, index: number) => {
      newHighlights.push({
        id: `weld-${index}`,
        type: 'weld_symbol',
        description: `${weld.type} weld`,
        x: weld.boundingBox?.x || 200 + index * 60,
        y: weld.boundingBox?.y || 180 + index * 40,
        width: weld.boundingBox?.width || 40,
        height: weld.boundingBox?.height || 40,
        confidence: weld.confidence || 0.85,
        partCategory: 'welding',
        isVisible: true,
        isUserModified: false
      });
    });

    // Convert parts to highlights
    analysis.parts?.forEach((part: any, index: number) => {
      newHighlights.push({
        id: `part-${index}`,
        type: 'structural_member',
        description: `${part.name} - ${part.type}`,
        x: part.boundingBox?.x || 150 + index * 70,
        y: part.boundingBox?.y || 200 + index * 50,
        width: part.boundingBox?.width || 100,
        height: part.boundingBox?.height || 50,
        confidence: part.confidence || 0.85,
        partCategory: 'parts',
        isVisible: true,
        isUserModified: false
      });
    });

    setHighlights(newHighlights);
  };

  // Trigger AI analysis
  const handleAIAnalysis = async () => {
    if (!drawingId) {
      toast({
        title: "No Drawing Selected",
        description: "Please select a drawing to analyze.",
        variant: "destructive",
      });
      return;
    }

    if (!credentialsStatus?.valid) {
      toast({
        title: "AWS Credentials Required",
        description: "Please configure AWS credentials to use AI analysis.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    analyzeDrawingMutation.mutate(drawingId);
  };

  // Mock AI analysis data for demonstration
  const mockHighlights: Highlight[] = [
    {
      id: '1',
      type: 'dimension',
      description: '24" length dimension',
      x: 150,
      y: 200,
      width: 120,
      height: 20,
      confidence: 0.95,
      partCategory: 'dimensions',
      isVisible: true,
      isUserModified: false
    },
    {
      id: '2',
      type: 'weld_symbol',
      description: 'Fillet weld symbol',
      x: 300,
      y: 150,
      width: 30,
      height: 30,
      confidence: 0.88,
      partCategory: 'welding',
      isVisible: true,
      isUserModified: false
    },
    {
      id: '3',
      type: 'part',
      description: 'Steel beam section',
      x: 100,
      y: 100,
      width: 200,
      height: 80,
      confidence: 0.92,
      partCategory: 'structural',
      isVisible: true,
      isUserModified: false
    }
  ];

  const handleAiToggle = async () => {
    if (!aiAnalysisEnabled) {
      setIsAnalyzing(true);
      // Simulate AI analysis
      setTimeout(() => {
        setHighlights(mockHighlights);
        setIsAnalyzing(false);
        setAiAnalysisEnabled(true);
      }, 2000);
    } else {
      setAiAnalysisEnabled(false);
      setHighlights([]);
    }
  };

  const toggleHighlight = (id: string) => {
    setHighlights(prev => prev.map(h => 
      h.id === id ? { ...h, isVisible: !h.isVisible } : h
    ));
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 25, 25));

  const handlePdfError = () => {
    setPdfError('Failed to load PDF document');
  };

  const getHighlightColor = (type: string, confidence: number) => {
    const opacity = confidence;
    switch (type) {
      case 'dimension': return `rgba(0, 255, 0, ${opacity})`;
      case 'weld_symbol': return `rgba(255, 165, 0, ${opacity})`;
      case 'part': return `rgba(0, 123, 255, ${opacity})`;
      default: return `rgba(255, 0, 0, ${opacity})`;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] p-0 bg-gray-50">
        <DialogTitle className="sr-only">AutoCAD Drawing Viewer - {drawingName}</DialogTitle>
        <DialogDescription className="sr-only">
          Professional CAD viewer for analyzing PDF engineering drawings with AI-powered dimension extraction and material identification.
        </DialogDescription>
        
        {/* AutoCAD-style Title Bar */}
        <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="text-sm font-medium">7M Quote CAD Viewer</div>
            <Separator orientation="vertical" className="h-4 bg-gray-600" />
            <div className="text-xs text-gray-300">{drawingName}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-gray-700">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Menu Bar */}
        <div className="bg-gray-200 border-b border-gray-300 px-4 py-1">
          <div className="flex items-center space-x-6 text-sm">
            {/* File Menu */}
            <div className="flex items-center space-x-1 px-3 py-1 hover:bg-gray-100 rounded cursor-pointer">
              <File className="h-4 w-4" />
              <span>File</span>
            </div>
            
            {/* Edit Menu */}
            <div className="flex items-center space-x-1 px-3 py-1 hover:bg-gray-100 rounded cursor-pointer">
              <span>Edit</span>
            </div>
            
            {/* Analysis Menu */}
            <div className="flex items-center space-x-1 px-3 py-1 hover:bg-gray-100 rounded cursor-pointer">
              <Cpu className="h-4 w-4" />
              <span>Analysis</span>
            </div>
            
            {/* View Menu */}
            <div className="flex items-center space-x-1 px-3 py-1 hover:bg-gray-100 rounded cursor-pointer">
              <Eye className="h-4 w-4" />
              <span>View</span>
            </div>
            
            {/* Layout Menu */}
            <div className="flex items-center space-x-1 px-3 py-1 hover:bg-gray-100 rounded cursor-pointer">
              <Grid3X3 className="h-4 w-4" />
              <span>Layout</span>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-gray-100 border-b border-gray-200 px-2 py-2">
          <div className="flex items-center space-x-1">
            {/* File Operations */}
            <div className="flex items-center space-x-1 mr-4">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <FolderOpen className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Save className="h-4 w-4" />
              </Button>
            </div>
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* Drawing Tools */}
            <div className="flex items-center space-x-1 mr-4">
              <Button 
                variant={activeTool === 'select' ? 'default' : 'ghost'} 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => setActiveTool('select')}
              >
                <MousePointer className="h-4 w-4" />
              </Button>
              <Button 
                variant={activeTool === 'move' ? 'default' : 'ghost'} 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => setActiveTool('move')}
              >
                <Move className="h-4 w-4" />
              </Button>
              <Button 
                variant={activeTool === 'line' ? 'default' : 'ghost'} 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => setActiveTool('line')}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button 
                variant={activeTool === 'rectangle' ? 'default' : 'ghost'} 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => setActiveTool('rectangle')}
              >
                <Square className="h-4 w-4" />
              </Button>
              <Button 
                variant={activeTool === 'circle' ? 'default' : 'ghost'} 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => setActiveTool('circle')}
              >
                <Circle className="h-4 w-4" />
              </Button>
            </div>
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* Zoom Controls */}
            <div className="flex items-center space-x-1 mr-4">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs px-2 py-1 bg-white border rounded">{zoomLevel}%</span>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* AI Analysis */}
            <div className="flex items-center space-x-2">
              <Button
                onClick={handleAIAnalysis}
                variant={analysisResults ? "default" : "outline"}
                size="sm"
                disabled={isAnalyzing || !credentialsStatus?.valid}
                className="flex items-center space-x-2"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
                <span>
                  {isAnalyzing ? "Analyzing..." : 
                   analysisResults ? "Analysis Complete" : 
                   "Run AI Analysis"}
                </span>
              </Button>
              
              {/* AWS Credentials Status */}
              {credentialsStatus?.valid === false && (
                <div className="flex items-center space-x-1 text-red-600">
                  <XCircle className="h-4 w-4" />
                  <span className="text-xs">AWS Setup Required</span>
                </div>
              )}
              
              {credentialsStatus?.valid === true && (
                <div className="flex items-center space-x-1 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-xs">AWS Ready</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Analysis Results Panel */}
          {(analysisResults || highlights.length > 0) && (
            <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
              <Tabs defaultValue="highlights" className="h-full">
                <div className="p-3 border-b border-gray-200">
                  <h4 className="font-medium text-sm mb-2">AI Analysis Results</h4>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="highlights">Highlights</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                  </TabsList>
                </div>
                
                <TabsContent value="highlights" className="p-2 space-y-2 mt-0">
                  {highlights.map((highlight) => (
                    <div key={highlight.id} className="flex items-center justify-between p-2 border rounded hover:bg-gray-50">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleHighlight(highlight.id)}
                        >
                          {highlight.isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        </Button>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{highlight.description}</div>
                          <div className="text-xs text-gray-500">{highlight.type}</div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {Math.round(highlight.confidence * 100)}%
                      </Badge>
                    </div>
                  ))}
                  {highlights.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-8">
                      Run AI analysis to see highlights
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="details" className="p-2 mt-0">
                  <ScrollArea className="h-full">
                    {analysisResults && (
                      <div className="space-y-4">
                        {/* Dimensions */}
                        {analysisResults.dimensions?.length > 0 && (
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm">Dimensions</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              {analysisResults.dimensions.map((dim: any, index: number) => (
                                <div key={index} className="text-xs">
                                  <span className="font-medium">{dim.type}:</span> {dim.value} {dim.unit}
                                  {dim.description && <div className="text-gray-500">{dim.description}</div>}
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        )}

                        {/* Materials */}
                        {analysisResults.materials?.length > 0 && (
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm">Materials</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              {analysisResults.materials.map((material: any, index: number) => (
                                <div key={index} className="text-xs">
                                  <span className="font-medium">{material.grade}</span>
                                  <div className="text-gray-500">{material.specification}</div>
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        )}

                        {/* Weld Symbols */}
                        {analysisResults.weldSymbols?.length > 0 && (
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm">Weld Symbols</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              {analysisResults.weldSymbols.map((weld: any, index: number) => (
                                <div key={index} className="text-xs">
                                  <span className="font-medium">{weld.type} weld</span>
                                  <div className="text-gray-500">Size: {weld.size}, Length: {weld.length}</div>
                                </div>
                              ))}
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}
                    {!analysisResults && (
                      <div className="text-center text-gray-500 text-sm py-8">
                        Run AI analysis to see detailed results
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="summary" className="p-2 mt-0">
                  {analysisResults && (
                    <div className="space-y-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Project Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span>Complexity:</span>
                            <Badge variant="outline">{analysisResults.projectComplexity}</Badge>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span>Est. Weight:</span>
                            <span>{analysisResults.estimatedWeight} lbs</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span>Est. Labor:</span>
                            <span>{analysisResults.estimatedLaborHours} hrs</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span>Confidence:</span>
                            <span>{Math.round(analysisResults.confidenceScore * 100)}%</span>
                          </div>
                        </CardContent>
                      </Card>

                      {analysisResults.analysisNotes?.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Analysis Notes</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="text-xs space-y-1 text-gray-600">
                              {analysisResults.analysisNotes.map((note: string, index: number) => (
                                <li key={index}>• {note}</li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                  {!analysisResults && (
                    <div className="text-center text-gray-500 text-sm py-8">
                      Run AI analysis to see project summary
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Drawing Canvas Area */}
          <div className="flex-1 bg-white relative overflow-auto">
            <div className="p-4">
              <div className="relative border border-gray-300 bg-white shadow-sm min-h-[600px]">
                {pdfError ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center text-red-500">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                      <div className="text-lg mb-2">Failed to load PDF</div>
                      <div className="text-sm">Please check the file format and try again</div>
                    </div>
                  </div>
                ) : actualPdfUrl ? (
                  <div className="relative">
                    {/* Universal PDF Viewer - Works on all browsers */}
                    <div className="w-full h-[600px] bg-gray-50 border-2 border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex flex-col h-full">
                        {/* PDF Toolbar */}
                        <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-medium text-gray-700">
                              {drawingName || 'Engineering Drawing'}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="text-xs text-gray-500">
                              {storageType === 's3' ? 'S3 Storage' : 'Local Storage'}
                            </div>
                            <Button
                              onClick={() => window.open(actualPdfUrl, '_blank')}
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700"
                              disabled={!actualPdfUrl}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Open in Browser
                            </Button>
                          </div>
                        </div>

                        {/* PDF Viewer with AI Analysis */}
                        <div className="flex-1 relative">
                          <PdfViewer
                            pdfUrl={actualPdfUrl}
                            onPageClick={(x, y, pdfX, pdfY) => {
                              console.log('PDF clicked at:', { x, y, pdfX, pdfY });
                              // Trigger AI analysis when PDF is clicked
                              if (drawingId && !isAnalyzing) {
                                console.log('Starting AI analysis for drawing:', drawingId);
                                setIsAnalyzing(true);
                                analyzeDrawingMutation.mutate(drawingId);
                              }
                            }}
                            highlights={highlights}
                            className="h-full"
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Overlay for highlights */}
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                      {highlights.filter(h => h.isVisible).map((highlight) => (
                        <div
                          key={highlight.id}
                          className="absolute border-2 pointer-events-auto cursor-pointer"
                          style={{
                            left: `${highlight.x * (zoomLevel / 100)}px`,
                            top: `${highlight.y * (zoomLevel / 100)}px`,
                            width: `${highlight.width * (zoomLevel / 100)}px`,
                            height: `${highlight.height * (zoomLevel / 100)}px`,
                            borderColor: getHighlightColor(highlight.type, highlight.confidence),
                            backgroundColor: getHighlightColor(highlight.type, 0.1),
                          }}
                          title={`${highlight.description} (${Math.round(highlight.confidence * 100)}% confidence)`}
                          onClick={() => toggleHighlight(highlight.id)}
                        >
                          <div className="absolute -top-6 left-0 bg-black text-white text-xs px-1 py-0.5 rounded whitespace-nowrap">
                            {highlight.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center text-gray-500">
                      <FileText className="h-8 w-8 mx-auto mb-2" />
                      <div className="text-lg mb-2">No PDF available</div>
                      <div className="text-sm">Please upload a PDF drawing to view</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="bg-gray-100 border-t px-4 py-2 text-sm text-gray-600 flex justify-between">
          <div className="flex items-center space-x-4">
            <span>Drawing: {drawingName}</span>
            <span>Tool: {activeTool}</span>
            {highlights.length > 0 && (
              <span>Highlights: {highlights.filter(h => h.isVisible).length}/{highlights.length}</span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <span>Zoom: {zoomLevel}%</span>
            <span>Ready</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}