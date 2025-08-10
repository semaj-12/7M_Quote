import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CloudUpload, X, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import HtmlPdfViewer from "./html-pdf-viewer";

interface PdfUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
}

// Simple PDF viewer - no complex highlight interfaces needed

export default function PdfUploadModal({ isOpen, onClose, userId }: PdfUploadModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [currentStep, setCurrentStep] = useState<'upload' | 'viewer'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [uploadedDrawing, setUploadedDrawing] = useState<any>(null);

  const uploadMutation = useMutation({
    mutationFn: async (data: { file: File; userId: number; name: string }) => {
      const formData = new FormData();
      formData.append('pdf', data.file);
      formData.append('userId', data.userId.toString());
      formData.append('name', data.name);

      return await fetch('/api/drawings/upload', {
        method: 'POST',
        body: formData,
      }).then(res => {
        if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
        return res.json();
      });
    },
    onSuccess: (data) => {
      // Use HTTP URL for PDF viewing since HTTPS is blocked by browsers
      const updatedData = {
        ...data,
        pdfUrl: data.filePath ? `http://localhost:5000/uploads/${data.filePath.split('/').pop()}` : data.pdfUrl
      };
      setUploadedDrawing(updatedData);
      setCurrentStep('viewer');
      queryClient.invalidateQueries({ queryKey: ['/api/drawings', userId] });
      toast({
        title: "Success",
        description: "Drawing uploaded successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: "Please select a PDF file",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        toast({
          title: "File too large",
          description: "Please select a file smaller than 50MB",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedFile(file);
      setFileName(file.name.replace('.pdf', ''));
    }
  };

  const handleUpload = () => {
    if (!selectedFile || !fileName.trim()) {
      toast({
        title: "Missing information",
        description: "Please select a file and provide a name",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate({
      file: selectedFile,
      userId,
      name: fileName.trim(),
    });
  };

  const handleAnalysisComplete = (highlights: Highlight[]) => {
    toast({
      title: "Analysis Complete",
      description: `${highlights.filter(h => h.isVisible).length} features identified for quoting`,
    });
    handleModalClose();
  };

  const handleModalClose = () => {
    setCurrentStep('upload');
    setSelectedFile(null);
    setFileName("");
    setUploadedDrawing(null);
    onClose();
  };

  return (
    <>
      {currentStep === 'upload' && (
        <Dialog open={isOpen} onOpenChange={handleModalClose}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                Upload Drawing
                <Button variant="ghost" size="sm" onClick={handleModalClose}>
                  <X className="h-4 w-4" />
                </Button>
              </DialogTitle>
              <DialogDescription>
                Upload your PDF engineering drawings for AI analysis and quote generation.
              </DialogDescription>
            </DialogHeader>
        
            <div className="p-6">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                  <CloudUpload className="h-6 w-6 text-blue-600" />
                </div>
                <div className="mt-4">
                  <p className="text-lg font-medium text-gray-900">Upload PDF Drawing</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Select a PDF file to upload and analyze
                  </p>
                </div>
                <div className="mt-6">
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <span className="sr-only">Choose file</span>
                    <input
                      id="file-upload"
                      name="file-upload"
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <span className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                      Choose PDF File
                    </span>
                  </label>
                </div>
                {selectedFile && (
                  <div className="mt-4 flex items-center justify-center">
                    <div className="flex items-center text-sm text-gray-600">
                      <FileText className="h-4 w-4 mr-2" />
                      <span>{selectedFile.name}</span>
                      <span className="ml-2 text-gray-400">
                        ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {selectedFile && (
                <div className="mt-6">
                  <Label htmlFor="fileName">Drawing Name</Label>
                  <Input
                    id="fileName"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder="Enter a name for this drawing"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This name will be used to identify the drawing in your project list
                  </p>
                </div>
              )}
            </div>
        
            <div className="flex justify-end space-x-3 px-6 py-4 border-t border-gray-200">
              <Button variant="outline" onClick={handleModalClose}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploadMutation.isPending}
                className="bg-primary text-white hover:bg-blue-700"
              >
                {uploadMutation.isPending ? "Uploading..." : "Upload & View PDF"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <HtmlPdfViewer
        isOpen={currentStep === 'viewer'}
        onClose={handleModalClose}
        drawingName={uploadedDrawing?.name || ''}
        drawingId={uploadedDrawing?.id}
      />
    </>
  );
}