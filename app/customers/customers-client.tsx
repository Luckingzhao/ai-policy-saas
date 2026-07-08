"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { CheckSquare, Download, FileSpreadsheet, Loader2, Plus, Search, Square, Trash2, Upload, UserRound } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type CustomerForm = {
  name: string;
  phone: string;
  wechat_id: string;
  gender: string;
  birth_date: string;
  city: string;
  notes: string;
};

const initialForm: CustomerForm = {
  name: "",
  phone: "",
  wechat_id: "",
  gender: "",
  birth_date: "",
  city: "",
  notes: ""
};

export function CustomersClient() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState<CustomerForm>(initialForm);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  async function loadCustomers() {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false });
    if (error) {
      setMessage(error.message);
    } else {
      setCustomers(data ?? []);
      setSelectedIds((current) => current.filter((id) => data?.some((customer) => customer.id === id)));
    }
    setIsLoading(false);
  }

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setMessage("请先登录后再创建客户。");
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.from("customers").insert({
      user_id: userData.user.id,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      wechat_id: form.wechat_id.trim() || null,
      gender: form.gender || null,
      birth_date: form.birth_date || null,
      city: form.city.trim() || null,
      notes: form.notes.trim() || null
    });
    setIsSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setForm(initialForm);
    setMessage("客户已创建。");
    await loadCustomers();
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setMessage("");
    setIsImporting(true);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setMessage("请先登录后再导入客户。");
        return;
      }

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
      if (!worksheet) {
        setMessage("Excel 文件中没有可导入的客户数据。");
        return;
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
      const payload = rows
        .map((row) => normalizeImportedCustomer(row, userData.user.id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      if (payload.length === 0) {
        setMessage("没有识别到客户姓名，请确认 Excel 中包含“姓名”列。");
        return;
      }

      const { error } = await supabase.from("customers").insert(payload);
      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage(`已成功导入 ${payload.length} 位客户。`);
      await loadCustomers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败，请检查 Excel 文件格式。");
    } finally {
      setIsImporting(false);
    }
  }

  function handleExport() {
    const rows = customers.map((customer) => ({
      姓名: customer.name,
      手机号: customer.phone ?? "",
      微信号: customer.wechat_id ?? "",
      性别: formatGender(customer.gender),
      出生日期: customer.birth_date ?? "",
      城市: customer.city ?? "",
      备注: customer.notes ?? ""
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: ["姓名", "手机号", "微信号", "性别", "出生日期", "城市", "备注"]
    });
    worksheet["!cols"] = [
      { wch: 14 },
      { wch: 16 },
      { wch: 18 },
      { wch: 10 },
      { wch: 14 },
      { wch: 14 },
      { wch: 34 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "客户档案");
    XLSX.writeFile(workbook, `客户档案_${formatExportDate(new Date())}.xlsx`);
  }

  function toggleSelected(customerId: string) {
    setSelectedIds((current) => (current.includes(customerId) ? current.filter((id) => id !== customerId) : [...current, customerId]));
  }

  function toggleSelectAll() {
    const filteredIds = filteredCustomers.map((customer) => customer.id);
    if (filteredIds.length > 0 && selectedIds.length === filteredIds.length) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(filteredIds);
  }

  async function deleteSelectedCustomers() {
    const ids = [...new Set(selectedIds)].filter(Boolean);
    if (ids.length === 0) return;

    if (!window.confirm(`确认删除已选中的 ${ids.length} 位客户吗？删除客户可能会影响其关联保单和报告，请谨慎操作。`)) return;

    setMessage("");
    setIsDeleting(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setMessage("请先登录后再删除客户。");
      setIsDeleting(false);
      return;
    }

    const { error } = await supabase.from("customers").delete().eq("user_id", userData.user.id).in("id", ids);
    setIsDeleting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSelectedIds([]);
    setMessage(`已删除 ${ids.length} 位客户。`);
    await loadCustomers();
  }

  const filteredCustomers = customers.filter((customer) => {
    const haystack = `${customer.name} ${customer.phone ?? ""} ${customer.wechat_id ?? ""} ${customer.city ?? ""}`;
    return haystack.toLowerCase().includes(query.toLowerCase());
  });
  const filteredIds = filteredCustomers.map((customer) => customer.id);
  const allSelected = filteredIds.length > 0 && selectedIds.length === filteredIds.length;
  const hasSelection = selectedIds.length > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold">新建客户</h2>
        </div>
        <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
          <Field label="姓名" required value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="手机号" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
            <Field label="微信号" value={form.wechat_id} onChange={(value) => setForm({ ...form, wechat_id: value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              性别
              <select
                value={form.gender}
                onChange={(event) => setForm({ ...form, gender: event.target.value })}
                className="rounded-md border border-slate-200 bg-white px-3 py-3 outline-none focus:border-brand"
              >
                <option value="">未填写</option>
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </select>
            </label>
            <Field
              label="出生日期"
              type="date"
              value={form.birth_date}
              onChange={(value) => setForm({ ...form, birth_date: value })}
            />
          </div>
          <Field label="城市" value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
          <label className="grid gap-2 text-sm font-medium">
            备注
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              className="min-h-24 rounded-md border border-slate-200 px-3 py-3 outline-none focus:border-brand"
              placeholder="家庭结构、已有保障、沟通偏好等"
            />
          </label>

          {message ? <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">{message}</p> : null}

          <button
            type="submit"
            disabled={isSaving || !form.name.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            保存客户
          </button>
        </form>
      </section>

      <section>
        <div className="mb-4 grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                disabled={isImporting}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Excel 导入客户
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={customers.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                导出客户 Excel
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="sr-only"
                onChange={handleImport}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                disabled={filteredCustomers.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {allSelected ? "取消全选" : "全选"}
              </button>
              <button
                type="button"
                onClick={deleteSelectedCustomers}
                disabled={!hasSelection || isDeleting}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-coral px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                删除已选
              </button>
            </div>
          </div>

          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-brand"
              placeholder="搜索客户姓名、手机号、微信号或城市"
            />
          </label>
        </div>

        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-50 text-brand">
              <FileSpreadsheet className="h-4 w-4" />
            </span>
            <p className="text-sm leading-6 text-slate-500">
              Excel 导入支持列名：姓名、手机号、微信号、性别、出生日期、城市、备注。姓名为必填，其余可留空。
            </p>
          </div>
        </div>

        {message ? <p className="mb-4 rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">{message}</p> : null}

        {isLoading ? <p className="rounded-lg bg-white p-6 text-sm text-slate-500">正在加载客户...</p> : null}

        {!isLoading && filteredCustomers.length === 0 ? (
          <EmptyState title="还没有客户" description="先创建客户，再到上传页面为客户绑定保单文件。" />
        ) : null}

        <div className="grid gap-3">
          {filteredCustomers.map((customer) => (
            <article
              key={customer.id}
              className={`rounded-lg border bg-white p-5 shadow-sm transition ${
                selectedIds.includes(customer.id) ? "border-coral/60 ring-2 ring-coral/10" : "border-slate-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleSelected(customer.id)}
                  className="mt-2 text-slate-400 hover:text-coral"
                  aria-label={selectedIds.includes(customer.id) ? "取消选择客户" : "选择客户"}
                >
                  {selectedIds.includes(customer.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                </button>
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-red-50 text-brand">
                  <UserRound className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{customer.name}</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    {customer.phone || "未填手机号"} · {customer.wechat_id || "未填微信"} · {customer.city || "未填城市"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">创建时间：{formatDateTime(customer.created_at)}</p>
                  {customer.notes ? <p className="mt-3 text-sm leading-6 text-slate-600">{customer.notes}</p> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-200 px-3 py-3 outline-none focus:border-brand"
      />
    </label>
  );
}

function normalizeImportedCustomer(row: Record<string, unknown>, userId: string) {
  const name = getCell(row, ["姓名", "客户姓名", "name"]).trim();
  if (!name) return null;

  return {
    user_id: userId,
    name,
    phone: getCell(row, ["手机号", "手机", "电话", "联系电话", "phone"]) || null,
    wechat_id: getCell(row, ["微信号", "微信", "wechat", "wechat_id"]) || null,
    gender: normalizeGender(getCell(row, ["性别", "gender"])) || null,
    birth_date: normalizeDate(getRawCell(row, ["出生日期", "生日", "birth_date"])) || null,
    city: getCell(row, ["城市", "所在城市", "city"]) || null,
    notes: getCell(row, ["备注", "说明", "notes"]) || null
  };
}

function getRawCell(row: Record<string, unknown>, keys: string[]) {
  const entry = Object.entries(row).find(([key]) => keys.includes(key.trim()));
  return entry?.[1] ?? "";
}

function getCell(row: Record<string, unknown>, keys: string[]) {
  const value = getRawCell(row, keys);
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatDateValue(value);
  return String(value).trim();
}

function normalizeGender(value: string) {
  const text = value.trim().toLowerCase();
  if (text === "男" || text === "male" || text === "m") return "male";
  if (text === "女" || text === "female" || text === "f") return "female";
  if (text === "其他" || text === "other") return "other";
  return "";
}

function normalizeDate(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return formatDateValue(value);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (!match) return text;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function formatGender(value: string | null) {
  if (value === "male") return "男";
  if (value === "female") return "女";
  if (value === "other") return "其他";
  return "";
}

function formatDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

function formatExportDate(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}
