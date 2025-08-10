import React from "react";
import PDFViewer from "@/components/pdf-viewer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function PDFDrawings() {
  const navigate = useNavigate();

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">PDF Drawings</h1>
        <Button onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
      </div>

      <Card className="p-4">
        <p className="text-gray-700 mb-4">
          Upload and preview PDF drawings. These files are uploaded to your AWS S3 bucket and can be analyzed by the system.
        </p>
        <PDFViewer />
      </Card>
    </div>
  );
}
