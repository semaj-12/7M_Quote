import React, { useState } from "react";
import { Worker, Viewer } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";
import axios from "axios";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { Label } from "./ui/label";
import { Button } from "./ui/button";

export default function PDFViewer() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileURL, setFileURL] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [s3Url, setS3Url] = useState<string | null>(null);

  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setFileURL(objectUrl);
      setUploadError(null);
      uploadToS3(file);
    } else {
      alert("Please select a valid PDF file.");
    }
  };

  const uploadToS3 = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("userId", "1");

      const response = await axios.post("/api/drawings/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.status === 200 && response.data?.s3Url) {
        console.log("✅ Upload successful:", response.data.s3Url);
        setS3Url(response.data.s3Url);
      } else {
        const msg = response.data?.message || "No URL returned from server.";
        setUploadError(`Upload completed but encountered an issue: ${msg}`);
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      setUploadError(err?.response?.data?.error || err.message || "Unknown error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <Label className="block mb-2 font-semibold text-lg">Upload a PDF</Label>
      <Input
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        className="mb-2"
      />

      {uploading && <p className="text-blue-600">Uploading to S3...</p>}
      {uploadError && <p className="text-red-600">Error: {uploadError}</p>}
      {s3Url && (
        <p className="text-green-600">
          Uploaded to S3: <a href={s3Url} target="_blank" rel="noreferrer">{s3Url}</a>
        </p>
      )}

      {fileURL ? (
        <div className="border rounded p-2 mt-4 h-[600px] w-full overflow-auto">
          <Worker workerUrl={`https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js`}>
            <Viewer
              fileUrl={fileURL}
              plugins={[defaultLayoutPluginInstance]}
            />
          </Worker>
        </div>
      ) : (
        <p className="text-gray-500">No PDF loaded. Please upload a file above.</p>
      )}
    </Card>
  );
}
