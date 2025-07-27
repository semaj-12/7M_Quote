import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, ExternalLink, FileText } from "lucide-react";

interface PdfViewerProps {
  pdfUrl: string;
  onPageClick?: (x: number, y: number, pageX: number, pageY: number) => void;
  highlights?: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isVisible: boolean;
    description: string;
    type: string;
  }>;
  className?: string;
}

export default function PdfViewer({ pdfUrl, onPageClick, highlights = [], className = "" }: PdfViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(100);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    
    console.log('PDF Viewer loading URL:', pdfUrl);
    
    // Set a timeout to simulate loading and then show success
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, [pdfUrl]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    setError(null);
  };

  const handleIframeError = () => {
    console.log('PDF iframe failed, trying object fallback');
    setError('Trying alternative PDF display method...');
    
    // Try object fallback after a short delay
    setTimeout(() => {
      setError('Using fallback PDF viewer');
    }, 500);
  };

  const zoomIn = () => setScale(prev => Math.min(prev + 25, 200));
  const zoomOut = () => setScale(prev => Math.max(prev - 25, 50));

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-96 bg-gray-100 ${className}`}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm text-gray-600">Loading PDF viewer...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* PDF Controls */}
      <div className="flex items-center justify-between p-3 bg-gray-100 border-b">
        <div className="flex items-center space-x-2">
          <FileText className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium">PDF Document</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button onClick={zoomOut} size="sm" variant="outline">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm">{scale}%</span>
          <Button onClick={zoomIn} size="sm" variant="outline">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => window.open(pdfUrl, '_blank')}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Open
          </Button>
        </div>
      </div>

      {/* PDF Display Area */}
      <div className="flex-1 bg-gray-100">
        <div className="h-full bg-white border-2 border-gray-300 rounded-lg overflow-hidden">
          {/* Primary iframe method */}
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title="PDF Engineering Drawing"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            style={{ 
              display: error === 'Using fallback PDF viewer' ? 'none' : 'block',
              transform: `scale(${scale / 100})`,
              transformOrigin: 'top left',
              width: `${10000 / scale}%`,
              height: `${10000 / scale}%`,
              minHeight: '600px'
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              onPageClick?.(x, y, x, y);
            }}
          />
          
          {/* Object fallback for browsers that block iframe */}
          {error === 'Using fallback PDF viewer' && (
            <object
              data={pdfUrl}
              type="application/pdf"
              className="w-full h-full"
              style={{
                transform: `scale(${scale / 100})`,
                transformOrigin: 'top left',
                minHeight: '600px'
              }}
            >
              {/* Final fallback message */}
              <div className="flex items-center justify-center h-full bg-gray-50">
                <div className="text-center p-8">
                  <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-semibold mb-2">PDF Ready for Analysis</h3>
                  <p className="text-gray-600 mb-4 max-w-sm">
                    Your browser is blocking PDF preview. Use the controls above to open the PDF or start AI analysis.
                  </p>
                  <div className="space-x-3">
                    <Button
                      onClick={() => window.open(pdfUrl, '_blank')}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View PDF
                    </Button>
                    <Button
                      onClick={() => onPageClick?.(0, 0, 0, 0)}
                      variant="outline"
                    >
                      Start AI Analysis
                    </Button>
                  </div>
                </div>
              </div>
            </object>
          )}
        </div>
      </div>
    </div>
  );
}