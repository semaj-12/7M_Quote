// src/components/FileUpload.jsx
import React, { useState } from "react";
import axios from "axios";

export default function FileUpload() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) return alert("Please select a file first.");
    const formData = new FormData();
    formData.append("file", file);

    try {
      setLoading(true);
      const res = await axios.post("http://localhost:5000/api/manual-upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
    } catch (err) {
      console.error("❌ Upload failed:", err.message);
      alert("Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-md">
      <h2 className="text-lg font-semibold mb-2">Upload Job File</h2>
      <input type="file" onChange={handleFileChange} className="mb-2" />
      <button onClick={handleUpload} className="bg-blue-600 text-white px-4 py-2 rounded" disabled={loading}>
        {loading ? "Processing..." : "Upload & Parse"}
      </button>

      {result && (
        <div className="mt-4 text-left">
          <h3 className="font-bold mb-1">Extracted Entities:</h3>
          <pre className="bg-gray-100 p-2 text-sm overflow-auto max-h-60">
            {JSON.stringify(result.entities, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
