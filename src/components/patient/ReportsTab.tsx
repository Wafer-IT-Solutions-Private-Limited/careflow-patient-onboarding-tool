"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

interface Report {
  id:            string;
  name:          string;
  mimeType:      string;
  fileSize:      number;
  extractedText: string | null;
  ocrUsed:       boolean;
  uploadedAt:    string;
}

function fmtSize(bytes: number) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function extractPdfText(file: File): Promise<{ text: string; ocrUsed: boolean }> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
    }

    const cleaned = text.trim();
    if (cleaned.length > 20) return { text: cleaned, ocrUsed: false };
    return await ocrPdfWithTesseract(arrayBuffer, pdf.numPages, pdfjsLib);
  } catch {
    return { text: "Could not extract text from this PDF.", ocrUsed: false };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ocrPdfWithTesseract(arrayBuffer: ArrayBuffer, numPages: number, pdfjsLib: any): Promise<{ text: string; ocrUsed: boolean }> {
  try {
    const pdfjsData   = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pagesToOcr  = Math.min(numPages, 3);
    let text = "";
    for (let i = 1; i <= pagesToOcr; i++) {
      const page     = await pdfjsData.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas   = document.createElement("canvas");
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
      const imageData = canvas.toDataURL("image/png");
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      const { data } = await worker.recognize(imageData);
      await worker.terminate();
      text += data.text + "\n";
    }
    return { text: text.trim() || "No text could be extracted.", ocrUsed: true };
  } catch {
    return { text: "OCR failed for this PDF.", ocrUsed: true };
  }
}

async function ocrImage(dataUrl: string): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  const { data } = await worker.recognize(dataUrl);
  await worker.terminate();
  return data.text.trim();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = () => {
      const result = reader.result as string;
      // Strip the data URL prefix — store only the base64 payload
      res(result.split(",")[1] ?? result);
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

export default function ReportsTab({ prn: _ }: { prn: string }) {
  const [reports,    setReports]    = useState<Report[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [processing, setProcessing] = useState(false);
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch("/api/patient/reports");
      if (res.ok) {
        const d = await res.json();
        setReports(d.reports ?? []);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleFile = useCallback(async (file: File) => {
    setProcessing(true);
    const toastId = toast.loading("Processing report…");
    try {
      const isPdf   = file.type === "application/pdf";
      const isImage = file.type.startsWith("image/");

      if (!isPdf && !isImage) {
        toast.error("Only PDF or image files are supported.", { id: toastId });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File exceeds 5 MB limit.", { id: toastId });
        return;
      }

      let extractedText = "";
      let ocrUsed = false;
      let dataUrlForOcr = "";

      if (isImage) {
        toast.loading("Running OCR on image…", { id: toastId });
        dataUrlForOcr = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload  = () => res(reader.result as string);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        extractedText = await ocrImage(dataUrlForOcr);
        ocrUsed = true;
      } else {
        toast.loading("Extracting text from PDF…", { id: toastId });
        const result  = await extractPdfText(file);
        extractedText = result.text;
        ocrUsed       = result.ocrUsed;
      }

      toast.loading("Uploading…", { id: toastId });
      const fileData = await fileToBase64(file);

      const res = await fetch("/api/patient/reports", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:          file.name,
          mimeType:      file.type,
          fileData,
          extractedText,
          ocrUsed,
          fileSize:      file.size,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "Upload failed", { id: toastId });
        return;
      }

      toast.success("Report saved", { id: toastId });
      await fetchReports();
      const d = await res.json().catch(() => ({}));
      if (d.report?.id) setExpanded(d.report.id);
    } catch {
      toast.error("Failed to process report", { id: toastId });
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [fetchReports]);

  const removeReport = async (id: string) => {
    const res = await fetch(`/api/patient/reports/${id}`, { method: "DELETE" });
    if (res.ok) {
      setReports(r => r.filter(x => x.id !== id));
      if (expanded === id) setExpanded(null);
    } else {
      toast.error("Failed to remove report");
    }
  };

  const openFile = (id: string) => {
    window.open(`/api/patient/reports/${id}/file`, "_blank");
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div>
      {/* Upload zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        style={{ background: "#fff", border: "2px dashed #D0CEC9", borderRadius: 14, padding: "32px 24px", textAlign: "center", cursor: processing ? "not-allowed" : "pointer", marginBottom: 24 }}
        onClick={() => !processing && fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <div style={{ fontSize: 32, marginBottom: 10 }}>📎</div>
        {processing ? (
          <div style={{ fontSize: 14, color: "#2563EB", fontWeight: 600 }}>Processing… please wait</div>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0C1929", marginBottom: 4 }}>Upload a Report</div>
            <div style={{ fontSize: 13, color: "#888" }}>Drag & drop or click — PDF or image (max 5 MB)</div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>Text is extracted automatically. Scanned PDFs use OCR.</div>
          </>
        )}
      </div>

      {/* Report list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa" }}>Loading reports…</div>
      ) : reports.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, padding: "48px 32px", textAlign: "center", boxShadow: "0 1px 6px rgba(0,0,0,.05)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🗂️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#444" }}>No reports uploaded yet.</div>
          <div style={{ fontSize: 13, color: "#999", marginTop: 4 }}>Upload your CT scans, MRI reports, blood tests and more.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {reports.map(r => (
            <div key={r.id} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 6px rgba(0,0,0,.05)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <span style={{ fontSize: 20 }}>{r.mimeType === "application/pdf" ? "📄" : "🖼️"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
                    {new Date(r.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    <span style={{ marginLeft: 6 }}>· {fmtSize(r.fileSize)}</span>
                    {r.ocrUsed && <span style={{ marginLeft: 8, color: "#7C3AED", fontWeight: 700 }}>• OCR</span>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={e => { e.stopPropagation(); openFile(r.id); }}
                    style={{ fontSize: 12, color: "#2563EB", background: "#EFF6FF", border: "none", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontWeight: 700 }}>
                    View
                  </button>
                  <button onClick={e => { e.stopPropagation(); removeReport(r.id); }}
                    style={{ fontSize: 12, color: "#DC2626", background: "#FEF2F2", border: "none", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontWeight: 700 }}>
                    Remove
                  </button>
                  <span style={{ fontSize: 12, color: "#888" }}>{expanded === r.id ? "▲" : "▼"}</span>
                </div>
              </div>

              {expanded === r.id && (
                <div style={{ borderTop: "1px solid #F0EEEA", padding: "16px 18px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                    Extracted Text {r.ocrUsed && <span style={{ color: "#7C3AED" }}>(via OCR)</span>}
                  </div>
                  {r.extractedText ? (
                    <pre style={{ fontSize: 12.5, color: "#333", background: "#F8F7F5", borderRadius: 8, padding: "12px 14px", whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto", fontFamily: "ui-monospace, monospace", lineHeight: 1.6 }}>
                      {r.extractedText}
                    </pre>
                  ) : (
                    <div style={{ fontSize: 13, color: "#aaa" }}>No text extracted.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11.5, color: "#bbb", textAlign: "center" }}>
        Reports are securely stored on the server and visible only to you and your treating doctor.
      </div>
    </div>
  );
}
