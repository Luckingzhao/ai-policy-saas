"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  ClipboardPenLine,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Square,
  Trash2,
  UploadCloud
} from "lucide-react";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { getMonthRange, getPlanLabel, getPlanLimit, isUsageLimitDisabled } from "@/lib/usage";

type Customer = Pick<Database["public"]["Tables"]["customers"]["Row"], "id" | "name" | "phone">;
type UploadedFile = Pick<
  Database["public"]["Tables"]["report_files"]["Row"],
  "id" | "customer_id" | "original_filename" | "object_path" | "mime_type" | "file_size" | "created_at"
>;
type Subscription = Pick<
  Database["public"]["Tables"]["subscriptions"]["Row"],
  "id" | "plan_code" | "monthly_report_limit" | "monthly_upload_limit"
>;
type UploadFormat = "pdf" | "excel" | "word" | "image";

const uploadFormats: Record<
  UploadFormat,
  {
    label: string;
    accept: string;
    extensions: string[];
    mimeTypes: string[];
    defaultMimeType: string;
    uploadLabel: string;
  }
> = {
  pdf: {
    label: "PDF 格式",
    accept: "application/pdf,.pdf",
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
    defaultMimeType: "application/pdf",
    uploadLabel: "PDF 文件"
  },
  excel: {
    label: "Excel 格式",
    accept: ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel",
    extensions: [".xlsx", ".xls"],
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"],
    defaultMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    uploadLabel: "Excel 文件"
  },
  word: {
    label: "Word 格式",
    accept: ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: [".doc", ".docx"],
    mimeTypes: ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    defaultMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    uploadLabel: "Word 文件"
  },
  image: {
    label: "图片格式",
    accept: "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    defaultMimeType: "image/jpeg",
    uploadLabel: "保单图片"
  }
};

const MAX_PDF_FILE_SIZE = 20 * 1024 * 1024;

export function UploadClient({ mode = "inspection" }: { mode?: "inspection" | "builder" }) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [uploadFormat, setUploadFormat] = useState<UploadFormat>("pdf");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [monthlyReportsUsed, setMonthlyReportsUsed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isDeletingFiles, setIsDeletingFiles] = useState(false);
  const [uploadStep, setUploadStep] = useState("");

  async function loadData() {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setIsLoading(false);
      return;
    }

    const monthRange = getMonthRange();
    const [customersResult, filesResult, subscriptionResult, usageResult] = await Promise.all([
      supabase
        .from("customers")
        .select("id,name,phone")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("report_files")
        .select("id,customer_id,original_filename,object_path,mime_type,file_size,created_at")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("subscriptions")
        .select("id,plan_code,monthly_report_limit,monthly_upload_limit")
        .eq("user_id", userData.user.id)
        .maybeSingle(),
      supabase
        .from("usage_logs")
        .select("quantity")
        .eq("user_id", userData.user.id)
        .eq("action", "generate_h5_report")
        .gte("created_at", monthRange.start)
        .lt("created_at", monthRange.end)
    ]);

    if (customersResult.error) {
      setMessage(customersResult.error.message);
    } else {
      setCustomers(customersResult.data ?? []);
      setCustomerId((current) => current || customersResult.data?.[0]?.id || "");
    }

    if (filesResult.error) {
      setMessage(filesResult.error.message);
    } else {
      setFiles(filesResult.data ?? []);
      setSelectedFileIds((current) => current.filter((id) => filesResult.data?.some((file) => file.id === id)));
    }

    if (!subscriptionResult.error) {
      setSubscription(subscriptionResult.data ?? null);
    }

    if (!usageResult.error) {
      setMonthlyReportsUsed((usageResult.data ?? []).reduce((total, row) => total + row.quantity, 0));
    }

    setIsLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const formatConfig = uploadFormats[uploadFormat];

    if (!selectedFile || !customerId) {
      setMessage(`请选择客户和${formatConfig.uploadLabel}。`);
      return;
    }

    if (!isAllowedFile(selectedFile, uploadFormat)) {
      setMessage(`当前选择的是${formatConfig.label}，请上传${formatConfig.extensions.join(" 或 ")} 文件。`);
      return;
    }

    if (isFileTooLarge(selectedFile, uploadFormat)) {
      setMessage(`单个 PDF 最大支持 ${formatSize(MAX_PDF_FILE_SIZE)}。当前文件 ${formatSize(selectedFile.size)}，请压缩 PDF 或拆分后再上传。`);
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setMessage("请先登录后再上传。");
      return;
    }

    const reportLimit = getPlanLimit(subscription?.plan_code, subscription?.monthly_report_limit);
    const usageLimitDisabled = isUsageLimitDisabled();
    if (!usageLimitDisabled && monthlyReportsUsed >= reportLimit) {
      setMessage(`本月报告额度已用完。当前套餐为${getPlanLabel(subscription?.plan_code)}，每月最多生成 ${reportLimit} 份报告。`);
      return;
    }

    setIsUploading(true);
    setUploadStep(`正在上传${formatConfig.uploadLabel}...`);

    try {
      const fileId = createId();
      const safeName = selectedFile.name.replace(/[^\w.\-]+/g, "_");
      const objectPath = `${userData.user.id}/${customerId}/${fileId}-${safeName}`;
      const contentType = selectedFile.type || formatConfig.defaultMimeType;

      const uploadResult = await withTimeout(
        supabase.storage.from("policy-pdfs").upload(objectPath, selectedFile, {
          cacheControl: "3600",
          upsert: false,
          contentType
        }),
        60000,
        `${formatConfig.uploadLabel}上传超时，请检查网络或 Supabase Storage bucket。`
      );

      if (uploadResult.error) {
        setMessage(uploadResult.error.message);
        return;
      }

      setUploadStep("正在保存文件记录...");
      const fileResult = await withTimeout(
        supabase
          .from("report_files")
          .insert({
            id: fileId,
            user_id: userData.user.id,
            customer_id: customerId,
            bucket: "policy-pdfs",
            object_path: objectPath,
            original_filename: selectedFile.name,
            mime_type: contentType,
            file_size: selectedFile.size,
            parse_status: "pending"
          })
          .select("id")
          .single(),
        20000,
        "文件记录保存超时，请稍后重试。"
      );

      if (fileResult.error) {
        setMessage(fileResult.error.message);
        return;
      }

      void supabase.from("usage_logs").insert({
        user_id: userData.user.id,
        subscription_id: subscription?.id ?? null,
        action: getUploadAction(uploadFormat),
        quantity: 1,
        metadata: {
          file_id: fileResult.data.id,
          customer_id: customerId,
          original_filename: selectedFile.name,
          source_file_type: uploadFormat
        }
      });

      setUploadStep("正在创建报告草稿...");
      const customerName = customers.find((customer) => customer.id === customerId)?.name ?? "客户";
      const slug = `${Date.now().toString(36)}-${fileId.slice(0, 8)}`;
      const reportResult = await withTimeout(
        supabase.from("h5_reports").insert({
          user_id: userData.user.id,
          customer_id: customerId,
          slug,
          title: mode === "builder" ? `${customerName}的产品方案评测` : `${customerName}的家庭保障报告`,
          status: "draft",
          summary: {
            report_file_id: fileResult.data.id,
            original_filename: selectedFile.name,
            source_file_type: uploadFormat,
            source_mime_type: contentType,
            module: mode === "builder" ? "policy_builder" : "policy_inspection",
            stage: "uploaded"
          },
          theme: {}
        }).select("id").single(),
        20000,
        "报告草稿创建超时，请稍后刷新报告列表确认。"
      );

      if (reportResult.error) {
        setMessage(reportResult.error.message);
        return;
      }

      void supabase.from("usage_logs").insert({
        user_id: userData.user.id,
        subscription_id: subscription?.id ?? null,
        action: "generate_h5_report",
        quantity: 1,
        metadata: {
          file_id: fileResult.data.id,
          customer_id: customerId,
          report_slug: slug,
          source_file_type: uploadFormat
        }
      });

      if (mode === "builder") {
        setUploadStep("正在解析方案资料...");
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("登录状态已失效，请重新登录。");

        const parseResponse = await fetch(`/api/reports/${reportResult.data.id}/parse`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const parseResult = (await parseResponse.json()) as { policy_count?: number; error?: string };
        if (!parseResponse.ok) throw new Error(parseResult.error || "方案资料解析失败。");
        if (!parseResult.policy_count) throw new Error("解析完成但未识别到产品，请检查文件内容或更换格式后重试。");

        router.push(`/policy-builder/reports/${reportResult.data.id}`);
        return;
      }

      setUploadStep("正在刷新上传记录...");
      setSelectedFile(null);
      setMessage("上传成功，已生成 H5 报告草稿。");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败，请稍后重试。");
    } finally {
      setIsUploading(false);
      setUploadStep("");
    }
  }

  function toggleFileSelected(fileId: string) {
    setSelectedFileIds((current) => (current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId]));
  }

  function toggleSelectAllFiles() {
    if (files.length > 0 && selectedFileIds.length === files.length) {
      setSelectedFileIds([]);
      return;
    }

    setSelectedFileIds(files.map((file) => file.id));
  }

  async function deleteSelectedFiles() {
    const ids = [...new Set(selectedFileIds)].filter(Boolean);
    if (ids.length === 0) return;

    if (!window.confirm(`确认删除已选中的 ${ids.length} 个上传文件吗？删除后，最近上传列表不再显示这些文件。`)) return;

    setMessage("");
    setIsDeletingFiles(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setMessage("请先登录后再删除上传文件。");
      setIsDeletingFiles(false);
      return;
    }

    const selectedFiles = files.filter((file) => ids.includes(file.id));
    const objectPaths = selectedFiles.map((file) => file.object_path).filter(Boolean);
    if (objectPaths.length > 0) {
      await supabase.storage.from("policy-pdfs").remove(objectPaths);
    }

    const { error } = await supabase.from("report_files").delete().eq("user_id", userData.user.id).in("id", ids);
    setIsDeletingFiles(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSelectedFileIds([]);
    setMessage(`已删除 ${ids.length} 个上传文件。`);
    await loadData();
  }

  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const reportLimit = getPlanLimit(subscription?.plan_code, subscription?.monthly_report_limit);
  const usageLimitDisabled = isUsageLimitDisabled();
  const selectedFileTooLarge = selectedFile ? isFileTooLarge(selectedFile, uploadFormat) : false;
  const allFilesSelected = files.length > 0 && selectedFileIds.length === files.length;
  const hasSelectedFiles = selectedFileIds.length > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-red-50 text-brand">
            <FileUp className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">{mode === "builder" ? "方案上传" : "上传文件"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {usageLimitDisabled
                ? "本地测试模式：已跳过报告额度限制"
                : `${getPlanLabel(subscription?.plan_code)}：本月已生成 ${monthlyReportsUsed}/${reportLimit} 份报告`}
            </p>
          </div>
        </div>

        <form onSubmit={handleUpload} className="mt-6 grid gap-5">
          <label className="grid gap-2 text-sm font-medium">
            文件格式
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(uploadFormats).map(([format, config]) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => {
                    setUploadFormat(format as UploadFormat);
                    setSelectedFile(null);
                    setMessage("");
                  }}
                  className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm font-semibold ${
                    uploadFormat === format ? "border-brand bg-red-50 text-brand" : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {getFormatIcon(format as UploadFormat)}
                  {config.label}
                </button>
              ))}
              <Link
                href={customerId ? `/policies/manual?customerId=${customerId}&source=${mode}` : `/policies/manual?source=${mode}`}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-600"
              >
                <ClipboardPenLine className="h-4 w-4" />
                手动表单录入
              </Link>
            </div>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            绑定客户
            <select
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-3 outline-none focus:border-brand"
              disabled={customers.length === 0}
            >
              {customers.length === 0 ? <option value="">请先创建客户</option> : null}
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                  {customer.phone ? ` · ${customer.phone}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid cursor-pointer gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
            <UploadCloud className="mx-auto h-8 w-8 text-brand" />
            <span className="font-semibold">{selectedFile ? selectedFile.name : `选择${uploadFormats[uploadFormat].uploadLabel}`}</span>
            <span className="text-sm text-slate-500">
              {mode === "builder" ? "上传后自动解析并生成产品评测方案" : "上传后会记录文件并创建报告草稿"}
            </span>
            <input
              key={uploadFormat}
              type="file"
              accept={uploadFormats[uploadFormat].accept}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedFile(file);
                if (file && isFileTooLarge(file, uploadFormat)) {
                  setMessage(`单个 PDF 最大支持 ${formatSize(MAX_PDF_FILE_SIZE)}。当前文件 ${formatSize(file.size)}，请压缩 PDF 或拆分后再上传。`);
                } else {
                  setMessage("");
                }
              }}
            />
          </label>
          {selectedFile ? (
            <div className={`rounded-md px-4 py-3 text-sm ${selectedFileTooLarge ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"}`}>
              已选择：{selectedFile.name} · {formatSize(selectedFile.size)}
              {selectedFileTooLarge ? "。文件过大，请压缩或拆分后再上传。" : ""}
            </div>
          ) : (
            <p className="rounded-md bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">PDF 文件单个最大支持 {formatSize(MAX_PDF_FILE_SIZE)}，超大扫描件建议先压缩或拆分。</p>
          )}

          {isUploading && uploadStep ? <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-brand">{uploadStep}</p> : null}
          {message ? <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">{message}</p> : null}

          <button
            type="submit"
            disabled={isUploading || customers.length === 0 || !selectedFile || selectedFileTooLarge}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {isUploading ? "处理中..." : mode === "builder" ? "上传产品资料并生成评测报告" : "上传并生成草稿"}
          </button>
        </form>
      </section>

      <section className="grid gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-semibold">最近上传</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleSelectAllFiles}
                disabled={files.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {allFilesSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {allFilesSelected ? "取消全选" : "全选"}
              </button>
              <button
                type="button"
                onClick={deleteSelectedFiles}
                disabled={!hasSelectedFiles || isDeletingFiles}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-coral px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeletingFiles ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                删除已选
              </button>
            </div>
          </div>
          {isLoading ? <p className="mt-4 text-sm text-slate-500">正在加载...</p> : null}
          {!isLoading && files.length === 0 ? <p className="mt-4 text-sm text-slate-500">暂无上传记录。</p> : null}
          <div className="mt-4 grid gap-3">
            {files.map((file) => (
              <article
                key={file.id}
                className={`rounded-md border p-4 transition ${
                  selectedFileIds.includes(file.id) ? "border-coral/60 bg-red-50 ring-2 ring-coral/10" : "border-transparent bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggleFileSelected(file.id)}
                    className="mt-0.5 text-slate-400 hover:text-coral"
                    aria-label={selectedFileIds.includes(file.id) ? "取消选择文件" : "选择文件"}
                  >
                    {selectedFileIds.includes(file.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                  </button>
                  {isExcelFile(file) ? (
                    <FileSpreadsheet className="mt-0.5 h-5 w-5 text-brand" />
                  ) : (
                    <FileText className="mt-0.5 h-5 w-5 text-brand" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{file.original_filename}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {customerMap.get(file.customer_id ?? "")?.name ?? "未知客户"} · {formatSize(file.file_size)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">上传时间：{formatDateTime(file.created_at)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function formatSize(size: number | null) {
  if (!size) return "未知大小";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function isAllowedFile(file: File, format: UploadFormat) {
  const config = uploadFormats[format];
  const filename = file.name.toLowerCase();
  const matchedExtension = config.extensions.some((extension) => filename.endsWith(extension));
  const matchedMimeType = file.type ? config.mimeTypes.includes(file.type) : false;
  return matchedExtension || matchedMimeType;
}

function isFileTooLarge(file: File, format: UploadFormat) {
  return format === "pdf" && file.size > MAX_PDF_FILE_SIZE;
}

function isExcelFile(file: UploadedFile) {
  const filename = file.original_filename.toLowerCase();
  return (
    filename.endsWith(".xlsx") ||
    filename.endsWith(".xls") ||
    file.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mime_type === "application/vnd.ms-excel"
  );
}

function getFormatIcon(format: UploadFormat) {
  if (format === "excel") return <FileSpreadsheet className="h-4 w-4" />;
  if (format === "word") return <FileType2 className="h-4 w-4" />;
  if (format === "image") return <ImageIcon className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function getUploadAction(format: UploadFormat) {
  if (format === "excel") return "upload_policy_excel";
  return "upload_policy_pdf";
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(promise)
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timer));
  });
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
