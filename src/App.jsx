// src/App.jsx
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import FileUpload from "./components/fileupload";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./components/ui/tabs";
import Papa from "papaparse";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import axios from "axios";
import {
  generateQuickBooksAuthUrl,
  generateXeroAuthUrl,
} from "./utils/auth";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";

export default function App() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    businessName: "",
    address: "",
    yearsInBusiness: "",
    shopRate: "",
    fieldRate: "",
    payroll: "",
    payrollType: "weekly",
    employees: "",
    password: "",
  });
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [parsedOutput, setParsedOutput] = useState([]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const nextStep = () => {
    if (step === 2) {
      localStorage.setItem("businessInfo", JSON.stringify(form));
      console.log("Saved business info:", form);
    }
    setStep(step + 1);
  };

  const handleFileUpload = (e) => {
    const newFiles = Array.from(e.target.files);
    const combinedFiles = [...uploadedFiles, ...newFiles];
    if (combinedFiles.length > 10) {
      alert("Please upload no more than 10 files total.");
      return;
    }

    const deduplicated = Array.from(
      new Map(combinedFiles.map((file) => [file.name, file])).values()
    );
    setUploadedFiles(deduplicated);
    setParsedOutput([]);

    deduplicated.forEach((file) => {
      const reader = new FileReader();

      if (file.name.endsWith(".csv")) {
        reader.onload = () => {
          const results = Papa.parse(reader.result, {
            header: true,
            skipEmptyLines: true,
          });
          setParsedOutput((prev) => [...prev, ...results.data]);
        };
        reader.readAsText(file);
      } else if (file.name.endsWith(".pdf")) {
        reader.onload = async () => {
          const typedarray = new Uint8Array(reader.result);
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          const page = await pdf.getPage(1);
          const textContent = await page.getTextContent();
          const strings = textContent.items.map((item) => item.str);
          setParsedOutput((prev) => [...prev, strings]);
        };
        reader.readAsArrayBuffer(file);
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full p-6">
        {step === 1 && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Sign Up / Log In</h1>
            <Tabs defaultValue="email" className="w-full">
              <TabsList>
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="google">Google</TabsTrigger>
                <TabsTrigger value="icloud">Outlook / iCloud</TabsTrigger>
              </TabsList>
              <TabsContent value="email">
                <Input name="email" placeholder="Enter your email" onChange={handleChange} />
                <Input name="password" type="password" placeholder="Enter your password" onChange={handleChange} className="mt-2" />
              </TabsContent>
              <TabsContent value="google">
                <Button>Continue with Google</Button>
              </TabsContent>
              <TabsContent value="icloud">
                <Button>Continue with Outlook / iCloud</Button>
              </TabsContent>
            </Tabs>
            <Button onClick={nextStep}>Continue</Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Business Information</h1>
            {Object.entries(form).map(([key, value]) => {
              if (key === "payrollType" || key === "password") return null;
              return (
                <div key={key} className="space-y-1">
                  <Label className="capitalize">{key.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase())}</Label>
                  <Input name={key} value={value} onChange={handleChange} placeholder={`Enter ${key}`} />
                </div>
              );
            })}
            <div className="space-y-1">
              <Label>Payroll Weekly or Bi-weekly</Label>
              <Input name="payroll" value={form.payroll} onChange={handleChange} placeholder="Enter payroll amount" />
              <div className="flex items-center gap-4 mt-2">
                <label className="flex items-center gap-2">
                  <input type="radio" name="payrollType" value="weekly" checked={form.payrollType === "weekly"} onChange={handleChange} />
                  Weekly
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="payrollType" value="bi-weekly" checked={form.payrollType === "bi-weekly"} onChange={handleChange} />
                  Bi-weekly
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Connect Your Accounting Software</Label>
              <div className="flex gap-4">
                <Button variant="outline" onClick={() => window.location.href = generateQuickBooksAuthUrl("ABy1OQJyFoA92TMJc3ygpiobNYradxNIM0VOdg6dPpjPb8NmSW")}>
                  Connect QuickBooks
                </Button>
                <Button variant="outline" onClick={() => window.location.href = generateXeroAuthUrl("9456145D451347C68C9E1FB697AA31B0")}>
                  Connect Xero
                </Button>
              </div>
            </div>
            <Button onClick={nextStep}>Continue</Button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Upload Job History</h1>
            <Input type="file" multiple onChange={handleFileUpload} className="bg-white" />
            {uploadedFiles.length > 0 && (
              <ul className="list-disc pl-6">
                {uploadedFiles.map((file, index) => (
                  <li key={index}>{file.name}</li>
                ))}
              </ul>
            )}
            {parsedOutput.length > 0 && (
              <div className="bg-gray-200 p-2 rounded">
                <pre className="text-sm overflow-auto">{JSON.stringify(parsedOutput, null, 2)}</pre>
              </div>
            )}

           <FileUpload />

<div className="flex gap-4 mt-4">
  <Button
    variant="outline"
    onClick={() => {
      axios
        .get("http://localhost:5000/api/quickbooks/company-info")
        .then((res) => {
          console.log("QuickBooks Company Info:", res.data);
          alert("Check console for QuickBooks company info");
        })
        .catch((err) => {
          console.error("QuickBooks error:", err);
          alert("QuickBooks API call failed");
        });
    }}
  >
    Fetch QuickBooks Info
  </Button>

  <Button
    variant="outline"
    onClick={() => {
      axios
        .get("http://localhost:5000/api/xero/connections")
        .then((res) => {
          console.log("Xero Connections:", res.data);
          alert("Check console for Xero connections");
        })
        .catch((err) => {
          console.error("Xero error:", err);
          alert("Xero API call failed");
        });
    }}
  >
    Fetch Xero Connections
  </Button>
</div>

          </div>
        )}
      </Card>
    </div>
  );
}
