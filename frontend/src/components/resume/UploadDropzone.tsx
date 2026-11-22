import { useRef, useState, type DragEvent } from "react";
import { FileUp, Loader2, ShieldCheck } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { Upload } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_MB = 5;

export function UploadDropzone({ onDone }: { onDone?: (u: Upload) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const upload = useMutation({
    meta: { silent: true },
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.upload<Upload>("/uploads/", fd);
    },
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ["uploads"] });
      toast.success("Uploaded — review what we extracted");
      onDone?.(u);
      navigate(`/app/uploads/${u.id}`);
    },
    onError: (e) => setError(e instanceof ApiError ? (e.field("file") ?? e.friendly) : "Upload failed."),
  });

  const pick = (file?: File | null) => {
    setError(null);
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "docx") return setError("Choose a PDF or DOCX file. Save .doc files as .docx first.");
    if (file.size > MAX_MB * 1024 * 1024) return setError(`Files must be ${MAX_MB} MB or smaller.`);
    upload.mutate(file);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files?.[0]);
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        disabled={upload.isPending}
        className={cn(
          "flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
          drag ? "border-brand-500 bg-brand-soft" : "border-line-strong bg-surface-2 hover:border-brand-400 hover:bg-brand-soft/40",
        )}
        aria-describedby="upload-help"
      >
        {upload.isPending ? <Loader2 className="size-8 animate-spin text-brand-500" /> : <FileUp className="size-8 text-brand-500" />}
        <p className="mt-3 font-medium">{upload.isPending ? "Uploading and reading your file…" : "Drop your resume here, or click to browse"}</p>
        <p id="upload-help" className="mt-1 text-sm text-muted">PDF or DOCX · up to {MAX_MB} MB</p>
      </button>
      <input ref={input} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} aria-label="Choose resume file" />
      {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck className="size-3.5 text-success" /> Stored privately. You'll review the extracted content before anything is saved to a resume.
      </p>
    </div>
  );
}
