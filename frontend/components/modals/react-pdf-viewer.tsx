import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from 'react-pdf';
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
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut
} from "lucide-react";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface ReactPdfViewerProps {
  isOpen: boolean;
  onClose: () => void;
  drawingName: string;
  drawingId?: number;
}

export default function ReactPdfViewer({
  isOpen,
  onClose,
  drawingName,
  drawingId
}: ReactPdfViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [storageType, setStorageType] = useState<'local' | 's3'>('local');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [pdfLoading, setPdfLoading] = useState(true);

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
            console.log(`PDF URL ready for react-pdf (${data.storageType}):`, data.url);
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

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPdfLoading(false);
    console.log(`PDF loaded successfully: ${numPages} pages`);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF load error:', error);
    setError('Failed to load PDF document');
    setPdfLoading(false);
  };

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

  const goToPreviousPage = () => {
    setPageNumber(prev => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setPageNumber(prev => Math.min(numPages, prev + 1));
  };

  const zoomIn = () => {
    setScale(prev => Math.min(3.0, prev + 0.2));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(0.5, prev - 0.2));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0">
        <DialogHeader className="p-4 border-b">
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
            Engineering drawing viewer - Page {pageNumber} of {numPages}
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
                <p className="text-xs text-gray-500 mt-2">
                  Try downloading the PDF instead.
                </p>
              </div>
            </div>
          )}

          {/* PDF Controls */}
          {!isLoading && !error && pdfUrl && (
            <div className="flex justify-center items-center space-x-4 mb-4 p-2 bg-gray-50 rounded-lg">
              <Button onClick={goToPreviousPage} disabled={pageNumber <= 1} size="sm" variant="outline">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                Page {pageNumber} of {numPages}
              </span>
              <Button onClick={goToNextPage} disabled={pageNumber >= numPages} size="sm" variant="outline">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="border-l pl-4 flex space-x-2">
                <Button onClick={zoomOut} size="sm" variant="outline">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium py-1 px-2">
                  {Math.round(scale * 100)}%
                </span>
                <Button onClick={zoomIn} size="sm" variant="outline">
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* React PDF Viewer */}
          {!isLoading && !error && pdfUrl && (
            <div className="flex justify-center">
              <div className="border border-gray-200 rounded-lg overflow-auto max-h-[60vh] bg-white">
                <Document
                  file={pdfUrl}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading={
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      <span className="ml-2 text-sm">Loading PDF document...</span>
                    </div>
                  }
                >
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    loading={
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                        <span className="ml-2 text-sm">Rendering page...</span>
                      </div>
                    }
                  />
                </Document>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}