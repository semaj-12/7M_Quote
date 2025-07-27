import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Loader2,
  AlertCircle,
  Download,
  CheckCircle,
  X
} from "lucide-react";

interface SimplePdfViewerProps {
  isOpen: boolean;
  onClose: () => void;
  drawingName: string;
  drawingId?: number;
}

export default function SimplePdfViewer({
  isOpen,
  onClose,
  drawingName,
  drawingId
}: SimplePdfViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [storageType, setStorageType] = useState<'local' | 's3'>('local');
  const [isDirect, setIsDirect] = useState<boolean>(false);
  const [urlExpiresIn, setUrlExpiresIn] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Fetch PDF URL when modal opens
  useEffect(() => {
    if (drawingId && isOpen) {
      const fetchPdfUrl = async () => {
        try {
          setIsLoading(true);
          setError(null);
          
          const response = await fetch(`/api/drawings/${drawingId}/url`);
          if (response.ok) {
            const data = await response.json();
            setPdfUrl(data.url);
            setStorageType(data.storageType);
            setIsDirect(data.direct || false);
            setUrlExpiresIn(data.expiresIn || 0);
            console.log(`PDF URL ready (${data.storageType}${data.direct ? ' - direct S3' : ' - proxy'}):`, data.url);
          } else {
            setError('Failed to load PDF URL');
          }
        } catch (err) {
          console.error('PDF URL fetch error:', err);
          setError('Network error loading PDF');
        } finally {
          setIsLoading(false);
        }
      };
      
      fetchPdfUrl();
    }
  }, [drawingId, isOpen]);

  const downloadPdf = () => {
    if (pdfUrl) {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = drawingName + '.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-6xl max-h-[90vh] p-0 fixed"
        style={{
          left: position.x || '50%',
          top: position.y || '50%',
          transform: position.x || position.y ? 'none' : 'translate(-50%, -50%)',
          cursor: isDragging ? 'grabbing' : 'default'
        }}
      >
        <DialogHeader 
          className="p-4 border-b cursor-grab select-none"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <span>{drawingName}</span>
              {storageType === 's3' && (
                <Badge variant="outline" className={isDirect ? "text-green-600" : "text-blue-600"}>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {isDirect ? 'S3 Direct' : 'S3 Proxy'}
                </Badge>
              )}
            </DialogTitle>
            <div className="flex items-center space-x-2">
              {pdfUrl && (
                <Button onClick={downloadPdf} variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              )}
              <Button onClick={onClose} variant="ghost" size="sm">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogDescription>
            Engineering drawing viewer - scroll to navigate through the document
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 p-0">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center h-96">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-600" />
                <p className="text-sm text-gray-600">Loading PDF...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="flex items-center justify-center h-96">
              <div className="text-center text-red-600">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">{error}</p>
                <p className="text-xs text-gray-500 mt-2">
                  The PDF proxy may not be working correctly. Try refreshing the page.
                </p>
              </div>
            </div>
          )}

          {/* Embedded PDF Viewer */}
          {!isLoading && !error && pdfUrl && (
            <div className="h-[70vh] w-full border rounded-lg overflow-hidden bg-gray-100">
              {/* Use iframe for better S3 compatibility */}
              <iframe
                src={pdfUrl}
                title={drawingName}
                width="100%"
                height="100%"
                className="w-full h-full border-0"
                onLoad={() => console.log('Simple PDF viewer iframe loaded')}
                onError={() => console.log('Simple PDF viewer iframe failed')}
                style={{ background: 'white' }}
                // Remove sandbox restrictions for S3 PDFs
                // sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
              />
              
              {/* Hidden fallback object for compatibility */}
              <div style={{ display: 'none' }}>
                <object
                  data={pdfUrl}
                  type="application/pdf"
                  className="w-full h-full"
                  aria-label={`PDF Viewer - ${drawingName}`}
                >
                  <div className="flex flex-col items-center justify-center h-full text-center p-8">
                    <FileText className="h-16 w-16 text-gray-400 mb-4" />
                    <p className="text-lg font-medium text-gray-700 mb-2">
                      PDF Viewer Not Available
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      Your browser may not support embedded PDF viewing.
                    </p>
                    <div className="space-y-2">
                      <Button
                        onClick={() => window.open(pdfUrl, '_blank')}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Open in New Tab
                      </Button>
                      <br />
                      <Button
                        onClick={downloadPdf}
                        variant="outline"
                      >
                        Download PDF
                      </Button>
                    </div>
                  </div>
                </object>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}