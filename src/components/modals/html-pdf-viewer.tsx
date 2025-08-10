import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Loader2,
  AlertCircle,
  Download,
  CheckCircle,
  X,
  ExternalLink
} from "lucide-react";

interface HtmlPdfViewerProps {
  isOpen: boolean;
  onClose: () => void;
  drawingName: string;
  drawingId?: number;
}

export default function HtmlPdfViewer({
  isOpen,
  onClose,
  drawingName,
  drawingId
}: HtmlPdfViewerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [storageType, setStorageType] = useState<'local' | 's3'>('local');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            console.log(`PDF URL ready for HTML embed (${data.storageType}):`, data.url);
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
                <Badge variant="outline" className="text-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  S3 Storage
                </Badge>
              )}
            </DialogTitle>
            <div className="flex items-center space-x-2">
              {pdfUrl && (
                <>
                  <Button onClick={() => window.open(pdfUrl, '_blank')} variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    New Tab
                  </Button>
                  <Button onClick={downloadPdf} variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </>
              )}
              <Button onClick={onClose} variant="ghost" size="sm">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogDescription>
            Engineering drawing viewer
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 p-4">
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
              </div>
            </div>
          )}

          {/* Multi-method PDF Viewer */}
          {!isLoading && !error && pdfUrl && (
            <div className="h-[70vh] w-full">
              {/* Direct iframe method - works best with S3 pre-signed URLs */}
              <iframe
                src={pdfUrl}
                title={drawingName}
                width="100%"
                height="100%"
                className="border border-gray-200 rounded-lg"
                onLoad={(e) => {
                  console.log('PDF iframe loaded successfully');
                  console.log('Iframe URL:', pdfUrl);
                }}
                onError={(e) => {
                  console.error('PDF iframe failed to load');
                  console.error('Failed URL:', pdfUrl);
                  console.error('Error event:', e);
                }}
                style={{ background: 'white' }}
                // Remove sandbox restrictions for S3 PDFs
                // sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
              />
              
              {/* Always visible action buttons */}
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 mb-2">
                  <strong>PDF Actions:</strong> Open in new tab or download if needed.
                </p>
                <div className="flex space-x-2">
                  <Button
                    onClick={() => window.open(pdfUrl, '_blank')}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Open in New Tab
                  </Button>
                  <Button
                    onClick={downloadPdf}
                    size="sm"
                    variant="outline"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download PDF
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}