import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ParsedPolicy = {
  policy_holder?: string | null;
  insured?: string | null;
  beneficiaries?: Array<{
    name?: string | null;
    relationship?: string | null;
    ratio?: number | string | null;
    type?: string | null;
  }>;
  insurer?: string | null;
  main_policy_name?: string | null;
  product_info?: string | null;
  insurance_type?: "重疾险" | "医疗险" | "意外险" | "年金险" | "寿险" | "其他" | null;
  coverage_amount?: number | string | null;
  annual_premium?: number | string | null;
  payment_period?: string | null;
  effective_date?: string | null;
  paid_years?: number | string | null;
  remaining_years?: number | string | null;
  remaining_premium?: number | string | null;
  policy_service?: string | null;
  benefit_details?: Array<{
    name?: string | null;
    type?: string | null;
    amount?: number | string | null;
    description?: string | null;
    waiting_period?: string | null;
  }>;
  payment_account?: string | null;
};

type ParsedPayload = {
  policies?: ParsedPolicy[];
};

type ExcelPolicyRow = {
  __formulas: Record<string, string>;
  [key: string]: string | Record<string, string>;
};

type AiaPolicyDetailRow = {
  policyHolder: string | null;
  insurer: string | null;
  productName: string;
  effectiveDate: string;
  coverageAmount: number | null;
  coveragePeriod: string | null;
  frequency: string | null;
  payType: string | null;
  paymentAccount: string | null;
  policyService: string | null;
};

const requiredFields: Array<keyof ParsedPolicy> = [
  "policy_holder",
  "insured",
  "insurer",
  "main_policy_name",
  "insurance_type",
  "coverage_amount",
  "annual_premium",
  "payment_period",
  "effective_date"
];

export async function POST(request: Request, context: RouteContext) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const deepSeekKey = process.env.DEEPSEEK_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openaiKey = openRouterKey || deepSeekKey || process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase 环境变量未配置。" }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const { id: reportId } = await context.params;
  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "登录状态无效。" }, { status: 401 });
  }

  const userId = userData.user.id;
  const { data: report, error: reportError } = await supabase
    .from("h5_reports")
    .select("id,user_id,customer_id,title,summary")
    .eq("id", reportId)
    .eq("user_id", userId)
    .single();

  if (reportError || !report) {
    return NextResponse.json({ error: "报告不存在或无权访问。" }, { status: 404 });
  }

  const reportFileId = getReportFileId(report.summary);
  if (!reportFileId) {
    return NextResponse.json({ error: "报告未绑定上传文件，无法解析。" }, { status: 400 });
  }

  const { data: file, error: fileError } = await supabase
    .from("report_files")
    .select("*")
    .eq("id", reportFileId)
    .eq("user_id", userId)
    .single();

  if (fileError || !file) {
    return NextResponse.json({ error: "上传文件不存在或无权访问。" }, { status: 404 });
  }

  try {
    const sourceFileType = isExcelFile(file.original_filename, file.mime_type) ? "excel" : "pdf";
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    await supabase.from("usage_logs").insert({
      user_id: userId,
      subscription_id: subscription?.id ?? null,
      action: sourceFileType === "excel" ? "parse_policy_excel" : "parse_policy_pdf",
      quantity: 1,
      metadata: {
        report_id: report.id,
        file_id: file.id,
        customer_id: report.customer_id,
        source_file_type: sourceFileType
      }
    });

    await supabase.from("report_files").update({ parse_status: "processing", parse_error: null }).eq("id", file.id).eq("user_id", userId);

    const { data: sourceBlob, error: downloadError } = await supabase.storage.from(file.bucket).download(file.object_path);
    if (downloadError || !sourceBlob) {
      throw new Error(downloadError?.message || "文件下载失败。");
    }

    const sourceBuffer = Buffer.from(await sourceBlob.arrayBuffer());
    let policies: ParsedPolicy[] = [];
    let sourceText = "";
    let reportJsonSource: "policy_pdf_parse" | "policy_excel_parse" = "policy_pdf_parse";

    if (sourceFileType === "excel") {
      policies = await extractPoliciesFromExcel(sourceBuffer);
      sourceText = buildExcelSourceText(policies);
      reportJsonSource = "policy_excel_parse";
      if (policies.length === 0) {
        throw new Error("未从 Excel 中识别到保单明细。请确认表格包含投保人、被保人、保险公司、主险名称、期缴保费等表头。");
      }
    } else {
      if (!isPdfFile(file.original_filename, file.mime_type)) {
        throw new Error("当前自动解析支持 PDF 和 Excel，请上传 .pdf、.xlsx 或 .xls 文件。");
      }
      const pdfText = await extractPdfText(sourceBuffer);
      if (pdfText.trim().length < 20) {
        throw new Error("PDF 文本内容过少，可能是扫描件或图片型保单。");
      }

      const localPolicies = extractPoliciesWithLocalRules(pdfText);
      const aiOptions = openaiKey
        ? {
            apiKey: openaiKey,
            provider: openRouterKey ? ("openrouter" as const) : deepSeekKey ? ("deepseek" as const) : ("openai" as const)
          }
        : null;
      const parsed = await extractPoliciesWithBestAvailableMethod(pdfText, localPolicies, aiOptions);
      policies = enrichPoliciesWithComputedFields(parsed.policies ?? [], pdfText);
      sourceText = pdfText;
      if (policies.length === 0) {
        throw new Error("未从 PDF 中识别到保单信息。");
      }
    }

    const { error: deleteOldPoliciesError } = await supabase
      .from("policies")
      .delete()
      .eq("user_id", userId)
      .eq("report_file_id", file.id);
    if (deleteOldPoliciesError) throw new Error(deleteOldPoliciesError.message);

    const existingPolicies = await loadExistingPolicyKeys(supabase, userId);
    const seenKeys = new Set<string>();
    let duplicateCount = 0;
    let insertedCount = 0;
    const missingFields: Array<{ policy: string; fields: string[] }> = [];
    const annualPremiums: Array<number | null> = [];
    const remainingPremiums: Array<number | null> = [];

    for (const policy of policies) {
      const key = policyKey(policy.insured, policy.main_policy_name, policy.effective_date);
      const displayName = policy.main_policy_name || policy.insured || "未命名保单";
      const missing = requiredFields.filter((field) => isBlank(policy[field])).map(fieldLabel);
      if (missing.length > 0) {
        missingFields.push({ policy: displayName, fields: missing });
      }

      const annualPremium = toNumber(policy.annual_premium);
      const remainingPremium = toNumber(policy.remaining_premium);
      annualPremiums.push(annualPremium);
      remainingPremiums.push(remainingPremium);

      if (!key || seenKeys.has(key) || existingPolicies.has(key)) {
        duplicateCount += 1;
        continue;
      }
      seenKeys.add(key);

      const { data: insertedPolicy, error: insertError } = await supabase
        .from("policies")
        .insert({
          user_id: userId,
          customer_id: report.customer_id,
          report_file_id: file.id,
          insurer_name: emptyToNull(policy.insurer),
          product_name: emptyToNull(policy.main_policy_name),
          policy_holder_name: emptyToNull(policy.policy_holder),
          insured_name: emptyToNull(policy.insured),
          premium_amount: annualPremium,
          premium_period: emptyToNull(policy.payment_period),
          coverage_amount: toNumber(policy.coverage_amount),
          effective_date: normalizeDate(policy.effective_date),
          insurance_type: emptyToNull(policy.insurance_type),
          product_info: emptyToNull(policy.product_info),
          paid_years: toInteger(policy.paid_years),
          remaining_years: toInteger(policy.remaining_years),
          remaining_premium: remainingPremium,
          policy_service: emptyToNull(policy.policy_service),
          payment_account: emptyToNull(policy.payment_account),
          raw_payload: policy as Json
        })
        .select("id")
        .single();

      if (insertError || !insertedPolicy) {
        throw new Error(insertError?.message || "保单保存失败。");
      }

      insertedCount += 1;

      const beneficiaries = (policy.beneficiaries ?? [])
        .filter((beneficiary) => !isBlank(beneficiary.name))
        .map((beneficiary) => ({
          user_id: userId,
          policy_id: insertedPolicy.id,
          name: String(beneficiary.name),
          relationship: emptyToNull(beneficiary.relationship),
          benefit_ratio: toNumber(beneficiary.ratio),
          beneficiary_type: emptyToNull(beneficiary.type)
        }));

      if (beneficiaries.length > 0) {
        const { error } = await supabase.from("beneficiaries").insert(beneficiaries);
        if (error) throw new Error(error.message);
      }

      const benefits = (policy.benefit_details ?? [])
        .filter((benefit) => !isBlank(benefit.name) || !isBlank(benefit.description))
        .map((benefit, index) => ({
          user_id: userId,
          policy_id: insertedPolicy.id,
          benefit_name: emptyToNull(benefit.name) ?? `保障责任 ${index + 1}`,
          benefit_type: emptyToNull(benefit.type),
          coverage_amount: toNumber(benefit.amount),
          description: emptyToNull(benefit.description),
          waiting_period: emptyToNull(benefit.waiting_period)
        }));

      if (benefits.length > 0) {
        const { error } = await supabase.from("policy_benefits").insert(benefits);
        if (error) throw new Error(error.message);
      }
    }

    const verificationRounds = buildVerificationRounds(sourceText, policies, {
      insertedCount,
      duplicateCount,
      missingFields,
      annualPremiumTotal: roundMoney(sum(annualPremiums)),
      remainingPremiumTotal: roundMoney(sum(remainingPremiums))
    });
    const qualityStatus = verificationRounds.every((round) => round.passed) ? "passed" : "review_required";
    const verification = {
      quality_status: qualityStatus,
      total_policy_count: policies.length,
      inserted_policy_count: insertedCount,
      annual_premium_total: roundMoney(sum(annualPremiums)),
      remaining_premium_total: roundMoney(sum(remainingPremiums)),
      has_duplicate_policies: duplicateCount > 0,
      duplicate_policy_count: duplicateCount,
      has_missing_fields: missingFields.length > 0,
      missing_fields: missingFields,
      remaining_premium_checks: buildRemainingPremiumChecks(policies),
      beneficiary_checks: buildBeneficiaryChecks(policies),
      verification_rounds: verificationRounds
    };

    const nextSummary = {
      ...(isPlainObject(report.summary) ? report.summary : {}),
      parse_status: "completed",
      parsed_at: new Date().toISOString(),
      review_status: "pending",
      reviewed_at: null,
      confirmed_at: null,
      verification,
      report_json: {
        version: 1,
        generated_at: new Date().toISOString(),
        source: reportJsonSource,
        report_id: report.id,
        customer_id: report.customer_id,
        file_id: file.id,
        verification,
        policies
      },
      extracted_policies: policies
    };

    await supabase.from("report_files").update({ parse_status: "completed", parse_error: null }).eq("id", file.id).eq("user_id", userId);
    await supabase.from("h5_reports").update({ summary: nextSummary as Json }).eq("id", report.id).eq("user_id", userId);

    return NextResponse.json({ ok: true, verification });
  } catch (error) {
    const message = error instanceof Error ? error.message : "解析失败。";
    await supabase.from("report_files").update({ parse_status: "failed", parse_error: message }).eq("id", file.id).eq("user_id", userId);
    await supabase
      .from("h5_reports")
      .update({
        summary: {
          ...(isPlainObject(report.summary) ? report.summary : {}),
          parse_status: "failed",
          parse_error: message,
          parsed_at: new Date().toISOString()
        } as Json
      })
      .eq("id", report.id)
      .eq("user_id", userId);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function extractPdfText(buffer: Buffer) {
  ensurePdfJsNodePolyfills();
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as typeof globalThis & { pdfjsWorker?: typeof worker }).pdfjsWorker = worker;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "./pdf.worker.mjs";
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true
  } as Parameters<typeof pdfjs.getDocument>[0]);
  const document = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ");
      pages.push(`===== PAGE ${pageNumber} =====\n${text}`);
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }

  return buildStablePdfText(pages);
}

function ensurePdfJsNodePolyfills() {
  if (typeof globalThis.DOMMatrix !== "undefined") return;

  class MinimalDOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(init?: number[] | string) {
      if (Array.isArray(init)) {
        this.a = Number(init[0] ?? 1);
        this.b = Number(init[1] ?? 0);
        this.c = Number(init[2] ?? 0);
        this.d = Number(init[3] ?? 1);
        this.e = Number(init[4] ?? 0);
        this.f = Number(init[5] ?? 0);
      }
    }

    multiplySelf(other: MinimalDOMMatrix) {
      const a = this.a * other.a + this.c * other.b;
      const b = this.b * other.a + this.d * other.b;
      const c = this.a * other.c + this.c * other.d;
      const d = this.b * other.c + this.d * other.d;
      const e = this.a * other.e + this.c * other.f + this.e;
      const f = this.b * other.e + this.d * other.f + this.f;
      this.a = a;
      this.b = b;
      this.c = c;
      this.d = d;
      this.e = e;
      this.f = f;
      return this;
    }

    preMultiplySelf(other: MinimalDOMMatrix) {
      const matrix = new MinimalDOMMatrix([other.a, other.b, other.c, other.d, other.e, other.f]);
      matrix.multiplySelf(this);
      this.a = matrix.a;
      this.b = matrix.b;
      this.c = matrix.c;
      this.d = matrix.d;
      this.e = matrix.e;
      this.f = matrix.f;
      return this;
    }

    translate(x = 0, y = 0) {
      return new MinimalDOMMatrix([this.a, this.b, this.c, this.d, this.e + x, this.f + y]);
    }

    scale(scaleX = 1, scaleY = scaleX) {
      return new MinimalDOMMatrix([this.a * scaleX, this.b * scaleX, this.c * scaleY, this.d * scaleY, this.e, this.f]);
    }

    invertSelf() {
      const determinant = this.a * this.d - this.b * this.c || 1;
      const a = this.d / determinant;
      const b = -this.b / determinant;
      const c = -this.c / determinant;
      const d = this.a / determinant;
      const e = (this.c * this.f - this.d * this.e) / determinant;
      const f = (this.b * this.e - this.a * this.f) / determinant;
      this.a = a;
      this.b = b;
      this.c = c;
      this.d = d;
      this.e = e;
      this.f = f;
      return this;
    }
  }

  Object.defineProperty(globalThis, "DOMMatrix", {
    value: MinimalDOMMatrix,
    configurable: true,
    writable: true
  });
}

function buildStablePdfText(pages: string[]) {
  const fullText = pages.join("\n\n");
  if (fullText.length <= 180000) return fullText;

  const importantPages = pages.filter((page) =>
    /保单明细|受益人明细|缴费日历|序号\s+保险公司\s+主险名称|家庭总保单数量|家庭年缴总保费|投保人|被保险人|首期缴费日|期缴保费/.test(page)
  );
  const compactImportantText = importantPages.join("\n\n");
  if (compactImportantText.length >= 3000) return compactImportantText.slice(0, 180000);

  return fullText.slice(0, 180000);
}

async function extractPoliciesFromExcel(buffer: Buffer): Promise<ParsedPolicy[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    cellFormula: true
  });

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) continue;

    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const header = findPolicyHeaderRow(sheet, range, XLSX);
    if (!header) continue;

    const policies: ParsedPolicy[] = [];
    for (let rowIndex = header.rowIndex + 1; rowIndex <= range.e.r; rowIndex += 1) {
      const row = readExcelRow(sheet, rowIndex, header.columns, XLSX);
      if (isBlankRow(row)) continue;
      if (isSummaryRow(row)) break;

      const policyHolder = rowValue(row, "投保人");
      const insured = rowValue(row, "被保人") || rowValue(row, "被保险人");
      const beneficiaryText = rowValue(row, "受益人");
      const insurer = rowValue(row, "保险公司");
      const productName = rowValue(row, "主险名称");
      const productInfo = rowValue(row, "产品信息");
      const insuranceType = rowValue(row, "保障类型");
      const coverageAmount = rowValue(row, "保险金额");
      const annualPremiumText = rowValue(row, "期缴保费");
      const remainingPremiumText = rowValue(row, "待缴保费");
      const policyService = rowValue(row, "保单服务");
      const benefitDetails = rowValue(row, "保障内容详解");
      const paymentAccount = rowValue(row, "缴费账户");
      const annualPremium = parseMoney(annualPremiumText);
      const remainingPremium = parseMoney(remainingPremiumText);
      const remainingFormula = row.__formulas["待缴保费"];
      const remainingYears = extractRemainingYears(remainingPremiumText, remainingFormula, annualPremium, remainingPremium);
      const paymentPeriod = pickTextFromValue(productInfo, [/(?:缴费期间|交费期间)[:：]?\s*([0-9一二三四五六七八九十百]+年|趸交|终身)/]);
      const effectiveDate = normalizeDate(productInfo) ?? normalizeDate(rowValue(row, "生效日"));

      policies.push({
        policy_holder: emptyToNull(policyHolder),
        insured: emptyToNull(insured),
        beneficiaries: parseExcelBeneficiaries(beneficiaryText),
        insurer: emptyToNull(insurer),
        main_policy_name: emptyToNull(productName),
        product_info: emptyToNull(productInfo),
        insurance_type: normalizeInsuranceType(insuranceType) ?? inferInsuranceType(`${productName} ${productInfo}`),
        coverage_amount: parseMoney(coverageAmount),
        annual_premium: annualPremium,
        payment_period: emptyToNull(rowValue(row, "缴费期间")) ?? paymentPeriod,
        effective_date: effectiveDate,
        paid_years: null,
        remaining_years: remainingYears,
        remaining_premium: remainingPremium ?? (annualPremium === null || remainingYears === null ? null : roundMoney(annualPremium * remainingYears)),
        policy_service: emptyToNull(policyService),
        benefit_details: buildExcelBenefitDetails(benefitDetails, insuranceType, coverageAmount),
        payment_account: emptyToNull(paymentAccount)
      });
    }

    const validPolicies = enrichPoliciesWithComputedFields(policies.filter(hasAnyPolicyField), buildExcelSourceText(policies));
    if (validPolicies.length > 0) return validPolicies;
  }

  return [];
}

function findPolicyHeaderRow(
  sheet: Record<string, unknown>,
  range: { s: { r: number; c: number }; e: { r: number; c: number } },
  XLSX: typeof import("xlsx")
) {
  const aliases = new Map<string, string>();
  for (const [canonical, names] of Object.entries(policyHeaderAliases)) {
    for (const name of names) aliases.set(normalizeHeader(name), canonical);
  }

  for (let rowIndex = range.s.r; rowIndex <= Math.min(range.e.r, range.s.r + 30); rowIndex += 1) {
    const columns = new Map<string, number>();
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
      const value = excelCellText(sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })]);
      const canonical = aliases.get(normalizeHeader(value));
      if (canonical && !columns.has(canonical)) columns.set(canonical, colIndex);
    }

    const score = ["投保人", "被保人", "保险公司", "主险名称", "期缴保费"].filter((name) => columns.has(name)).length;
    if (score >= 4) return { rowIndex, columns };
  }

  return null;
}

const policyHeaderAliases = {
  投保人: ["投保人"],
  被保人: ["被保人", "被保险人"],
  受益人: ["受益人"],
  保险公司: ["保险公司", "承保公司"],
  主险名称: ["主险名称", "产品名称", "险种名称"],
  产品信息: ["产品信息"],
  保障类型: ["保障类型", "险种类型"],
  保险金额: ["保险金额", "保额", "基本保险金额"],
  期缴保费: ["期缴保费", "年缴保费", "年交保费", "保费"],
  缴费期间: ["缴费期间", "交费期间"],
  生效日: ["生效日", "首期缴费日", "合同生效日"],
  待缴保费: ["待缴保费", "待交保费"],
  保单服务: ["保单服务"],
  保障内容详解: ["保障内容详解", "保险责任", "保障责任"],
  缴费账户: ["缴费账户", "交费账户", "扣款账户"]
};

function readExcelRow(
  sheet: Record<string, unknown>,
  rowIndex: number,
  columns: Map<string, number>,
  XLSX: typeof import("xlsx")
): ExcelPolicyRow {
  const row: ExcelPolicyRow = { __formulas: {} };
  for (const [name, colIndex] of columns.entries()) {
    const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
    row[name] = excelCellText(cell);
    const formula = excelCellFormula(cell);
    if (formula) row.__formulas[name] = formula;
  }
  return row;
}

function excelCellText(cell: unknown) {
  if (!cell || typeof cell !== "object") return "";
  const record = cell as { w?: unknown; v?: unknown };
  const value = record.w ?? record.v;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value === null || value === undefined ? "" : String(value).trim();
}

function excelCellFormula(cell: unknown) {
  if (!cell || typeof cell !== "object") return "";
  const formula = (cell as { f?: unknown }).f;
  return typeof formula === "string" ? formula : "";
}

function rowValue(row: ExcelPolicyRow, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function isBlankRow(row: ExcelPolicyRow) {
  return Object.entries(row)
    .filter(([key]) => key !== "__formulas")
    .every(([, value]) => isBlank(value));
}

function isSummaryRow(row: ExcelPolicyRow) {
  return /合计|总计|家庭合计/.test([row["投保人"], row["被保人"], row["主险名称"]].filter(Boolean).join(" "));
}

function hasAnyPolicyField(policy: ParsedPolicy) {
  return [policy.policy_holder, policy.insured, policy.insurer, policy.main_policy_name, policy.annual_premium].some((value) => !isBlank(value));
}

function parseExcelBeneficiaries(value: unknown): ParsedPolicy["beneficiaries"] {
  const textValue = emptyToNull(value);
  if (!textValue) return [];
  if (/^法定$|法定受益人/.test(textValue)) return [{ name: "法定", relationship: null, ratio: null, type: "法定" }];

  return textValue
    .split(/[;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (/^法定$|法定受益人/.test(item)) return { name: "法定", relationship: null, ratio: null, type: "法定" };
      const [name = item, relationship = "", ratio = ""] = item.split(/[·,，]/).map((part) => part.trim());
      return {
        name,
        relationship: relationship || null,
        ratio: toNumber(ratio),
        type: "指定"
      };
    });
}

function buildExcelBenefitDetails(value: unknown, insuranceType: unknown, amount: unknown): NonNullable<ParsedPolicy["benefit_details"]> {
  const description = emptyToNull(value);
  if (!description) return [];
  return [
    {
      name: "保障内容详解",
      type: emptyToNull(insuranceType),
      amount: parseMoney(amount),
      description,
      waiting_period: null
    }
  ];
}

function normalizeInsuranceType(value: unknown): ParsedPolicy["insurance_type"] {
  const textValue = emptyToNull(value);
  if (!textValue) return null;
  if (/重疾|重大疾病/.test(textValue)) return "重疾险";
  if (/医疗|住院|门诊|健康保障/.test(textValue)) return "医疗险";
  if (/意外/.test(textValue)) return "意外险";
  if (/年金|养老金|教育金/.test(textValue)) return "年金险";
  if (/寿险|身故|终身寿|两全/.test(textValue)) return "寿险";
  return "其他";
}

function extractRemainingYears(value: unknown, formula: string, annualPremium: number | null, remainingPremium: number | null) {
  const textValue = emptyToNull(value) ?? "";
  const textMatch = textValue.match(/[×x*]\s*(\d+(?:\.\d+)?)\s*年?/i);
  if (textMatch?.[1]) return Number(textMatch[1]);

  const formulaMatch = String(formula ?? "").match(/[*×]\s*(\d+(?:\.\d+)?)/);
  if (formulaMatch?.[1]) return Number(formulaMatch[1]);

  if (annualPremium && remainingPremium !== null) return Math.max(Math.round((remainingPremium / annualPremium) * 100) / 100, 0);
  return null;
}

function buildExcelSourceText(policies: ParsedPolicy[]) {
  const totalAnnualPremium = roundMoney(sum(policies.map((policy) => toNumber(policy.annual_premium))));
  return `家庭总保单数量 ${policies.length} 份；家庭年缴总保费 ${totalAnnualPremium} 元；Excel保单明细。`;
}

async function extractPoliciesWithOpenAI(
  pdfText: string,
  options: {
    apiKey: string;
    provider: "openai" | "openrouter" | "deepseek";
  }
): Promise<ParsedPayload> {
  const isOpenRouter = options.provider === "openrouter";
  const isDeepSeek = options.provider === "deepseek";
  const openai = new OpenAI({
    apiKey: options.apiKey,
    timeout: 45000,
    baseURL: isDeepSeek ? "https://api.deepseek.com" : isOpenRouter ? "https://openrouter.ai/api/v1" : undefined,
    defaultHeaders: isOpenRouter
      ? {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-OpenRouter-Title": "AI Family Protection Advisor"
        }
      : undefined
  });
  const primaryModel = isDeepSeek
      ? process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"
      : isOpenRouter
        ? process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat"
        : process.env.OPENAI_MODEL || "gpt-4o-mini";
  const models = isOpenRouter ? Array.from(new Set([primaryModel, "deepseek/deepseek-chat"])) : [primaryModel];
  const textLimits = isOpenRouter ? [6000, 3000] : [16000, 8000];
  const relevantText = extractRelevantPolicyText(pdfText);
  let lastError: unknown;

  for (const model of models) {
    for (const textLimit of textLimits) {
      try {
        const completion = await createChatCompletionWithRetry(openai, {
          model,
          temperature: 0,
          max_tokens: isOpenRouter ? 1200 : 3000,
          response_format: { type: "json_object" },
          messages: buildPolicyExtractionMessages(relevantText.slice(0, textLimit))
        }, isOpenRouter ? 0 : 1);

        const content = getCompletionContent(completion);
        if (!content) throw new Error("MODEL_EMPTY_RESPONSE");
        return parseModelJson(content);
      } catch (error) {
        lastError = error;
        if (!isOpenRouter || (!isRetryableModelError(error) && !isEmptyModelResponse(error))) {
          throw normalizeModelError(error);
        }
      }
    }
  }

  if (isOpenRouter && process.env.DEEPSEEK_API_KEY) {
    try {
      return await extractPoliciesWithOpenAI(pdfText.slice(0, 8000), {
        apiKey: process.env.DEEPSEEK_API_KEY,
        provider: "deepseek"
      });
    } catch (error) {
      lastError = error;
    }
  }

  const localPolicies = extractPoliciesWithLocalRules(relevantText);
  if (localPolicies.length > 0) {
    return { policies: localPolicies };
  }

  throw normalizeModelError(lastError);
}

async function extractPoliciesWithBestAvailableMethod(
  pdfText: string,
  localPolicies: ParsedPolicy[],
  aiOptions: {
    apiKey: string;
    provider: "openai" | "openrouter" | "deepseek";
  } | null
): Promise<ParsedPayload> {
  const expectedCount = extractExpectedPolicyCount(pdfText);
  if (isAiaFamilyReport(pdfText) && hasCoreLocalFields(localPolicies) && (!expectedCount || expectedCount === localPolicies.length)) {
    return { policies: localPolicies };
  }

  if (hasReliableLocalExtraction(localPolicies, pdfText)) {
    return { policies: localPolicies };
  }

  if (!aiOptions) {
    if (localPolicies.length > 0) return { policies: localPolicies };
    throw new Error("请配置 DEEPSEEK_API_KEY、OPENROUTER_API_KEY 或 OPENAI_API_KEY，或上传文本型保单 PDF。");
  }

  try {
    const aiParsed = await extractPoliciesWithOpenAI(pdfText, aiOptions);
    const aiPolicies = aiParsed.policies ?? [];
    const expectedCount = extractExpectedPolicyCount(pdfText);
    if (aiPolicies.length > 0 && aiPolicies.length >= localPolicies.length && (!expectedCount || aiPolicies.length >= expectedCount)) return aiParsed;
  } catch (error) {
    if (localPolicies.length === 0) throw error;
  }

  return { policies: localPolicies };
}

function hasReliableLocalExtraction(policies: ParsedPolicy[], pdfText: string) {
  if (policies.length === 0) return false;
  const expectedCount = extractExpectedPolicyCount(pdfText);
  const hasCoreFields = hasCoreLocalFields(policies);
  return hasCoreFields && (!expectedCount || expectedCount === policies.length);
}

function hasCoreLocalFields(policies: ParsedPolicy[]) {
  if (policies.length === 0) return false;
  const hasCoreFields = policies.every(
    (policy) =>
      !isBlank(policy.policy_holder) &&
      !isBlank(policy.insured) &&
      !isBlank(policy.insurer) &&
      !isBlank(policy.main_policy_name) &&
      !isBlank(policy.effective_date) &&
      toNumber(policy.annual_premium) !== null
  );
  return hasCoreFields;
}

function extractExpectedPolicyCount(text: string) {
  const match = text.match(/(\d+)\s*份\s*家庭总保单数量/);
  return match?.[1] ? Number(match[1]) : null;
}

function getCompletionContent(completion: OpenAI.Chat.Completions.ChatCompletion) {
  const message = completion.choices[0]?.message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) return content;

  const maybeReasoning = message as { reasoning?: unknown };
  if (typeof maybeReasoning.reasoning === "string" && maybeReasoning.reasoning.trim().startsWith("{")) {
    return maybeReasoning.reasoning;
  }

  return "";
}

function isEmptyModelResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("MODEL_EMPTY_RESPONSE") || message.includes("模型未返回解析结果");
}

function extractRelevantPolicyText(pdfText: string) {
  const normalized = pdfText.replace(/\s+/g, " ").trim();
  const keywords = [
    "投保人",
    "被保人",
    "被保险人",
    "受益人",
    "保险公司",
    "保险金额",
    "基本保险金额",
    "保险费",
    "保费",
    "缴费",
    "交费",
    "生效日",
    "保险期间",
    "保障",
    "责任",
    "账户",
    "主险",
    "险种",
    "产品"
  ];
  const snippets: string[] = [];

  for (const keyword of keywords) {
    let index = normalized.indexOf(keyword);
    let count = 0;
    while (index !== -1 && count < 4) {
      const start = Math.max(0, index - 240);
      const end = Math.min(normalized.length, index + 520);
      snippets.push(normalized.slice(start, end));
      index = normalized.indexOf(keyword, index + keyword.length);
      count += 1;
    }
  }

  const deduped = Array.from(new Set(snippets));
  const compact = deduped.join("\n---\n");
  return compact.length >= 800 ? compact : normalized;
}

function buildPolicyExtractionMessages(pdfText: string): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content:
        "你是保险保单结构化解析助手。只输出 JSON，不输出解释。若字段缺失，用 null。保障类型只能是：重疾险、医疗险、意外险、年金险、寿险、其他。金额输出数字，日期输出 YYYY-MM-DD。"
    },
    {
      role: "user",
      content: `请从以下保单 PDF 文本中提取结构化 JSON。输出必须是紧凑 JSON，不要换行解释。格式：
{"policies":[{"policy_holder":"投保人","insured":"被保人","beneficiaries":[{"name":"受益人","relationship":"关系","ratio":100,"type":"法定/指定"}],"insurer":"保险公司","main_policy_name":"主险名称","product_info":"产品信息","insurance_type":"重疾险/医疗险/意外险/年金险/寿险/其他","coverage_amount":100000,"annual_premium":1000,"payment_period":"缴费期间","effective_date":"YYYY-MM-DD","paid_years":1,"remaining_years":19,"remaining_premium":19000,"policy_service":"保单服务","benefit_details":[{"name":"保障内容名称","type":"保障类型","amount":100000,"description":"保障内容详解","waiting_period":"等待期"}],"payment_account":"缴费账户"}]}

PDF 文本：
${pdfText}`
    }
  ];
}

function parseModelJson(content: string): ParsedPayload {
  try {
    return JSON.parse(content) as ParsedPayload;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型返回内容不是有效 JSON。");
    return JSON.parse(match[0]) as ParsedPayload;
  }
}

function extractPoliciesWithLocalRules(text: string): ParsedPolicy[] {
  const aiaPolicies = extractAiaFamilyReportPolicies(text);
  if (aiaPolicies.length > 0) return aiaPolicies;

  const singlePolicy = extractSinglePolicyWithLocalRules(text);
  return singlePolicy ? [singlePolicy] : [];
}

function extractAiaFamilyReportPolicies(text: string): ParsedPolicy[] {
  if (!isAiaFamilyReport(text)) return [];

  const compact = text.replace(/\s+/g, " ").trim();
  const reportDate = extractReportDate(text);
  const fallbackPolicyHolder = pickText(compact, [/尊敬的([^\s]{2,8})女士/, /女士亲启([^\s]{2,8})/]);
  const account = extractPaymentAccount(compact);
  const page8 = extractPageText(text, 8);
  const page9 = extractPageText(text, 9);
  const detailPages = extractPolicyDetailPages(text);
  const paymentRows = extractPaymentScheduleRows(text);
  const detailRows = extractAiaPolicyDetailRows(text);

  return paymentRows.map((row) => {
    const productName = normalizeProductName(row.productName);
    const detailRow = findBestDetailRow(detailRows, row, productName);
    const annualPremium = toNumber(row.annualPremium);
    const coverageAmount = detailRow?.coverageAmount ?? extractCoverageAmountForPremium(text, row.annualPremium);
    const paymentPeriodYears = extractYears(row.paymentPeriod);
    const paidYears = calculatePaidYears(row.effectiveDate, paymentPeriodYears, reportDate);
    const remainingYears = paymentPeriodYears === null || paidYears === null ? null : Math.max(paymentPeriodYears - paidYears, 0);
    const remainingPremium = annualPremium === null || remainingYears === null ? null : roundMoney(annualPremium * remainingYears);
    const benefitSource = findBenefitSection(detailPages, productName) || `${page8}\n${page9}`;

    return {
      policy_holder: detailRow?.policyHolder ?? fallbackPolicyHolder,
      insured: row.insured,
      beneficiaries: extractAiaBeneficiaries(text, productName, row.insured),
      insurer: detailRow?.insurer ?? row.insurer,
      main_policy_name: productName,
      product_info: buildProductInfo(row.effectiveDate, row.paymentPeriod, detailRow),
      insurance_type: inferInsuranceType(productName + benefitSource),
      coverage_amount: coverageAmount,
      annual_premium: annualPremium,
      payment_period: row.paymentPeriod,
      effective_date: row.effectiveDate,
      paid_years: paidYears,
      remaining_years: remainingYears,
      remaining_premium: remainingPremium,
      policy_service: detailRow?.policyService ?? null,
      benefit_details: extractAiaBenefitDetails(benefitSource),
      payment_account: detailRow?.paymentAccount ?? account
    };
  });
}

function isAiaFamilyReport(text: string) {
  return /友邦/.test(text) && /保单管家|保单明细|缴费日历/.test(text);
}

function extractPaymentScheduleRows(text: string) {
  const rows: Array<{
    insurer: string;
    productName: string;
    insured: string;
    effectiveDate: string;
    paymentPeriod: string;
    annualPremium: string;
  }> = [];
  const paymentPages = text
    .split(/===== PAGE \d+ =====/)
    .filter((page) => /序号\s+保险公司\s+主险名称\s+被保险人\s+首期缴费日\s+缴费期间\s+缴费频率\s+期缴保费/.test(page));
  const pattern =
    /(?:^|\s)\d{1,2}\s+(友邦人寿)\s+(.{2,100}?)\s+([\u4e00-\u9fa5*·A-Za-z0-9]{2,12})\s+(\d{4}-\d{2}-\d{2})\s+(\d+年|趸交|终身)\s+(?:年缴|月缴|季缴|半年缴|趸交)\s+([0-9,.]+)/g;

  for (const page of paymentPages) {
    const compactPage = page.replace(/\s+/g, " ").trim();
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(compactPage)) !== null) {
      const row = {
        insurer: match[1],
        productName: normalizeProductName(match[2]),
        insured: match[3],
        effectiveDate: match[4],
        paymentPeriod: match[5],
        annualPremium: match[6]
      };
      if (!isValidPaymentScheduleRow(row)) continue;
      rows.push({
        insurer: row.insurer,
        productName: row.productName,
        insured: row.insured,
        effectiveDate: row.effectiveDate,
        paymentPeriod: row.paymentPeriod,
        annualPremium: row.annualPremium
      });
    }
  }
  return mergePaymentScheduleRows(rows, extractPaymentScheduleRowsFromCompactText(text));
}

function extractPaymentScheduleRowsFromCompactText(text: string) {
  const rows: Array<{
    insurer: string;
    productName: string;
    insured: string;
    effectiveDate: string;
    paymentPeriod: string;
    annualPremium: string;
  }> = [];
  const paymentText = text.slice(Math.max(0, text.indexOf("序号 保险公司 主险名称 被保险人 首期缴费日 缴费期间 缴费频率 期缴保费")));
  const compact = paymentText.replace(/\s+/g, " ");
  const pattern =
    /(?:^|\s)\d{1,2}\s+(友邦人寿)\s+(.{2,120}?)\s+([\u4e00-\u9fa5*·A-Za-z0-9]{2,12})\s+(\d{4}-\d{2}-\d{2})\s+(\d+年|趸交|终身)\s+(?:年缴|月缴|季缴|半年缴|趸交)\s+([0-9,.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(compact)) !== null) {
    const row = {
      insurer: match[1],
      productName: normalizeProductName(match[2]),
      insured: match[3],
      effectiveDate: match[4],
      paymentPeriod: match[5],
      annualPremium: match[6]
    };
    if (!isValidPaymentScheduleRow(row)) continue;
    rows.push(row);
  }
  return rows;
}

function mergePaymentScheduleRows(
  primaryRows: ReturnType<typeof extractPaymentScheduleRowsFromCompactText>,
  fallbackRows: ReturnType<typeof extractPaymentScheduleRowsFromCompactText>
) {
  const merged: ReturnType<typeof extractPaymentScheduleRowsFromCompactText> = [];
  const seen = new Set<string>();
  for (const row of [...primaryRows, ...fallbackRows]) {
    const key = `${row.insured}|${normalizeProductName(row.productName)}|${row.effectiveDate}|${row.annualPremium}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

function isValidPaymentScheduleRow(row: {
  insurer: string;
  productName: string;
  insured: string;
  effectiveDate: string;
  paymentPeriod: string;
  annualPremium: string;
}) {
  if (!/人寿|保险|养老|健康/.test(row.insurer)) return false;
  if (!row.productName || row.productName.length > 48) return false;
  if (/保险公司|主险名称|被保险人|首期缴费日|缴费期间|缴费频率|期缴保费|序号/.test(row.productName)) return false;
  if (!/保险|寿险|医疗|年金|两全|意外|重疾|重大疾病/.test(row.productName)) return false;
  if (!row.insured || /保险公司|主险名称|序号/.test(row.insured)) return false;
  return toNumber(row.annualPremium) !== null;
}

function extractAiaPolicyDetailRows(text: string) {
  const detailPages = text
    .split(/===== PAGE \d+ =====/)
    .filter((page) => /投保人\s+保险公司\s+主险名称\s+产品信息\s+保障类型\s+保险金额\s+期缴保费\s+缴费账户\s+保单服务/.test(page));
  const rows: AiaPolicyDetailRow[] = [];

  for (const page of detailPages) {
    const pageRows = extractPolicyDetailRows(page);
    const amountPairs = extractAiaDetailAmountPairs(page).reverse();
    pageRows.forEach((row, index) => {
      const pair = amountPairs[index];
      rows.push({
        ...row,
        coverageAmount: pair?.coverageAmount ?? row.coverageAmount
      });
    });
  }

  return mergeDetailRows([], rows);
}

function extractAiaDetailAmountPairs(pageText: string) {
  const firstHeaderIndex = pageText.search(/投保人\s+保险公司\s+主险名称\s+产品信息\s+保障类型\s+保险金额\s+期缴保费/);
  if (firstHeaderIndex < 0) return [];
  const numberZone = pageText.slice(0, firstHeaderIndex).replace(/\s+/g, " ");
  return Array.from(numberZone.matchAll(/\b(\d{1,3}(?:,\d{3})*|\d+)\s+(\d{1,3}(?:,\d{3})+)\b/g))
    .map((match) => ({
      annualPremium: toNumber(match[1]),
      coverageAmount: toNumber(match[2])
    }))
    .filter((pair): pair is { annualPremium: number; coverageAmount: number } => pair.annualPremium !== null && pair.coverageAmount !== null);
}

function extractPolicyDetailRows(text: string) {
  const rows: AiaPolicyDetailRow[] = [];
  const pattern =
    /投保人\s+保险公司\s+主险名称\s+产品信息\s+保障类型\s+保险金额\s+期缴保费\s+缴费账户\s+保单服务\s*\n([\u4e00-\u9fa5*·A-Za-z0-9]{2,12})\s+([\u4e00-\u9fa5]{2,20})\s+([\s\S]{2,80}?)\n生效日:(\d{4}-\d{2}-\d{2})\n缴费期间:([^\n]+)\n保障期间:\s*([^\n]+)\n缴费频率:([^\n]+)\n赔付方式:([^\n]+)\n([\s\S]*?)(?=\n投保人\s+保险公司\s+主险名称|\n保单明细|\n受益人明细|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const tail = match[9];
    const row = {
      policyHolder: match[1]?.trim() ?? null,
      insurer: match[2]?.trim() ?? null,
      productName: normalizeProductName(match[3]),
      effectiveDate: match[4],
      coverageAmount: extractCoverageAmountForDetailRow(text, match[4]),
      coveragePeriod: match[6]?.trim() ?? null,
      frequency: match[7]?.trim() ?? null,
      payType: match[8]?.trim() ?? null,
      paymentAccount: extractDetailPaymentAccount(tail),
      policyService: extractDetailPolicyService(tail)
    };
    if (!isValidDetailRow(row)) continue;
    rows.push(row);
  }
  return mergeDetailRows(rows, extractPolicyDetailRowsFromCompactText(text));
}

function extractPolicyDetailRowsFromCompactText(text: string) {
  const rows: AiaPolicyDetailRow[] = [];
  const compact = text.replace(/\s+/g, " ").trim();
  const pattern =
    /([\u4e00-\u9fa5*·A-Za-z0-9]{2,12})\s+(友邦人寿)\s+(友邦[\s\S]{2,100}?)\s+生效日:(\d{4}-\d{2}-\d{2})\s+缴费期间:([^\s]+)\s+保障期间:\s*([^\s]+)\s+缴费频率:([^\s]+)\s+赔付方式:([^\s]+)\s+([\s\S]*?)(?=\s+[\u4e00-\u9fa5*·A-Za-z0-9]{2,12}\s+友邦人寿\s+友邦|\s+投保人\s+保险公司\s+主险名称|\s+(?:本人|配偶|儿子|女儿|父亲|母亲|父母|子女)\s+-|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(compact)) !== null) {
    const row = {
      policyHolder: match[1]?.trim() ?? null,
      insurer: match[2]?.trim() ?? null,
      productName: normalizeProductName(match[3]),
      effectiveDate: match[4],
      coverageAmount: extractCoverageAmountNearDetailMatch(compact, match.index),
      coveragePeriod: match[6]?.trim() ?? null,
      frequency: match[7]?.trim() ?? null,
      payType: match[8]?.trim() ?? null,
      paymentAccount: extractDetailPaymentAccount(match[9]),
      policyService: extractDetailPolicyService(match[9])
    };
    if (!isValidDetailRow(row)) continue;
    rows.push(row);
  }
  return rows;
}

function mergeDetailRows(
  primaryRows: AiaPolicyDetailRow[],
  fallbackRows: AiaPolicyDetailRow[]
) {
  const merged: AiaPolicyDetailRow[] = [];
  const seen = new Set<string>();
  for (const row of [...primaryRows, ...fallbackRows]) {
    const key = `${normalizeProductName(row.productName)}|${row.effectiveDate}|${row.policyHolder ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged;
}

function extractCoverageAmountNearDetailMatch(text: string, matchIndex: number) {
  const before = text.slice(Math.max(0, matchIndex - 120), matchIndex);
  const candidates = Array.from(before.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})(?=\s|$)/g))
    .map((match) => toNumber(match[1]))
    .filter((value): value is number => value !== null);
  const meaningful = candidates.filter((value) => value >= 1000);
  return meaningful.at(-1) ?? null;
}

function findBestDetailRow(
  detailRows: ReturnType<typeof extractPolicyDetailRows>,
  paymentRow: {
    insured: string;
    productName: string;
    effectiveDate: string;
    annualPremium: string;
  },
  productName: string
) {
  return (
    detailRows.find((item) => item.effectiveDate === paymentRow.effectiveDate && isSameAiaProduct(item.productName, productName)) ??
    detailRows.find((item) => item.effectiveDate === paymentRow.effectiveDate) ??
    detailRows.find((item) => isSameAiaProduct(item.productName, productName))
  );
}

function isValidDetailRow(row: {
  policyHolder: string | null;
  insurer: string | null;
  productName: string;
  effectiveDate: string;
}) {
  if (!row.policyHolder || /投保人|保险公司|主险名称|^\d+$/.test(row.policyHolder)) return false;
  if (!row.insurer || !/人寿|保险|养老|健康/.test(row.insurer)) return false;
  if (!row.productName || /投保人|保险公司|主险名称|产品信息/.test(row.productName)) return false;
  return Boolean(normalizeDate(row.effectiveDate));
}

function extractCoverageAmountForDetailRow(text: string, effectiveDate: string) {
  const index = text.indexOf(`生效日:${effectiveDate}`);
  if (index === -1) return null;
  const before = text.slice(Math.max(0, index - 260), index);
  const amountPairs = Array.from(before.matchAll(/([0-9][0-9,.]*)\s*([0-9]{1,3}(?:,[0-9]{3})+)/g));
  const lastPair = amountPairs.at(-1);
  return lastPair?.[2] ? toNumber(lastPair[2]) : null;
}

function extractDetailPaymentAccount(text: string) {
  const normalized = text.replace(/\s+/g, " ");
  const bank = normalized.match(/(工商银行|农业银行|中国银行|建设银行|招商银行|交通银行|邮储银行|浦发银行|兴业银行|民生银行|平安银行|广发银行|中信银行)/)?.[1];
  const tail = bank ? normalized.slice(normalized.indexOf(bank) + bank.length).match(/\b(\d{4})\b/)?.[1] : null;
  if (bank && tail) return `${bank} ${tail}`;
  return bank ?? null;
}

function extractDetailPolicyService(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(/\b\d{4}\s+(.+?)(?=$|\s+投保人|\s+保单明细)/);
  const service = match?.[1]?.trim();
  if (!service || service.length > 30) return null;
  return service;
}

function extractPolicyDetailPages(text: string) {
  return text
    .split(/===== PAGE \d+ =====/)
    .filter((page) => /保单详细利益|责任|保额/.test(page));
}

function extractPageText(text: string, pageNumber: number) {
  const pattern = new RegExp(`===== PAGE ${pageNumber} =====([\\s\\S]*?)(?===== PAGE ${pageNumber + 1} =====|$)`);
  const match = text.match(pattern);
  return match?.[1] ?? "";
}

function normalizeProductName(value: string) {
  const compact = value.replace(/\s+/g, "").replace(/重大疾病保险保险$/, "重大疾病保险").trim();
  if (/长保康惠长期医疗保险\(费率可$/.test(compact)) return `${compact}调)`;
  if (/全佑倍呵护荣耀珍藏版重大疾病$/.test(compact)) return `${compact}保险`;
  if (/全佑惠享珍藏版重$/.test(compact)) return `${compact}大疾病保险`;
  if (/安行无忧A款两全保$/.test(compact)) return `${compact}险`;
  if (/安享全佑恶性肿瘤$/.test(compact)) return `${compact}疾病保险`;
  return compact;
}

function extractCoverageAmountForPremium(text: string, premium: string) {
  const escapedPremium = premium.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escapedPremium}\\s*([0-9]{1,3}(?:,[0-9]{3})+)`));
  return match?.[1] ? toNumber(match[1]) : null;
}

function extractPaymentAccount(text: string) {
  const bank = pickText(text, [
    /开户银行[:： ]{0,3}([^\s]+)/,
    /(工商银行|农业银行|中国银行|建设银行|招商银行|交通银行|邮储银行|浦发银行|兴业银行|民生银行|平安银行|广发银行|中信银行)/
  ]);
  const tail = pickText(text, [/银行卡号后四位[:： ]{0,3}(\d{4})/, /尾号[:： ]{0,3}(\d{4})/]);
  if (bank && tail) return `${bank}，尾号${tail}`;
  return bank ?? null;
}

function buildProductInfo(
  effectiveDate: string,
  paymentPeriod: string,
  detailRow?: {
    coveragePeriod: string | null;
    frequency: string | null;
    payType: string | null;
  }
) {
  return [
    `生效日：${effectiveDate}`,
    `缴费期间：${paymentPeriod}`,
    detailRow?.coveragePeriod ? `保障期间：${detailRow.coveragePeriod}` : null,
    detailRow?.frequency ? `缴费频率：${detailRow.frequency}` : null,
    detailRow?.payType ? `赔付方式：${detailRow.payType}` : null
  ]
    .filter(Boolean)
    .join("；");
}

function extractAiaBeneficiaries(pageText: string, productName: string, insured?: string | null): ParsedPolicy["beneficiaries"] {
  if (!productName || productName.length > 80) return [];
  const orderedEntries = parseAiaBeneficiaryEntriesByTableOrder(pageText);
  const orderedMatched = orderedEntries.find(
    (entry) => (!insured || entry.insured === insured) && isSameAiaProduct(entry.productName, productName)
  );
  if (orderedMatched) return orderedMatched.beneficiaries;

  const section = extractAiaBeneficiarySection(pageText, insured);
  const entries = parseAiaBeneficiaryEntries(section);
  const matched = entries.find((entry) => isSameAiaProduct(entry.productName, productName));
  if (matched) return matched.beneficiaries;

  const compactSection = section.replace(/\s+/g, " ");
  for (const variant of getAiaProductMatchVariants(productName)) {
    const productPattern = buildLooseTextPattern(variant);
    const windowMatch = compactSection.match(new RegExp(`${productPattern}([\\s\\S]{0,260})`));
    if (!windowMatch) continue;

    const afterProduct = windowMatch[1] ?? "";
    const specifiedMatch = afterProduct.match(/指定\s+([^\s]+)\s+第一顺序\s+([^\s]+)\s+([0-9.]+)%/);
    const legalMatch = afterProduct.match(/法定\s+--/);
    const specifiedIndex = specifiedMatch?.index ?? Number.POSITIVE_INFINITY;
    const legalIndex = legalMatch?.index ?? Number.POSITIVE_INFINITY;

    if (legalIndex < specifiedIndex) {
      return [{ name: "法定", relationship: null, ratio: null, type: "法定" }];
    }

    if (specifiedMatch) {
      return [
        {
          name: specifiedMatch[1],
          relationship: specifiedMatch[2],
          ratio: Number(specifiedMatch[3]),
          type: "指定"
        }
      ];
    }
  }

  return [];
}

function parseAiaBeneficiaryEntriesByTableOrder(text: string) {
  const entries: Array<{
    insured: string | null;
    productName: string;
    beneficiaries: NonNullable<ParsedPolicy["beneficiaries"]>;
  }> = [];
  const pages = text.split(/===== PAGE \d+ =====/).filter((page) => /主险名称\s+类型\s+姓名\s+顺序\s+关系\s+份额/.test(page));

  for (const page of pages) {
    const labels = Array.from(
      page.matchAll(/(?:本人|配偶|儿子|女儿|父亲|母亲|父母|子女)\s*-\s*([^\s（]{1,16})\s*（被保险人）/g)
    ).map((match) => match[1]);
    const blocks = page
      .split(/主险名称\s+类型\s+姓名\s+顺序\s+关系\s+份额\s+备注/)
      .slice(1)
      .map((block) => block.trim())
      .filter(Boolean);

    blocks.forEach((block, index) => {
      const insured = labels[index] ?? (labels.length === 1 ? labels[0] : null);
      for (const entry of parseAiaBeneficiaryEntriesFromBlock(block)) {
        entries.push({ insured, ...entry });
      }
    });
  }

  return entries;
}

function parseAiaBeneficiaryEntriesFromBlock(block: string) {
  const entries: Array<{
    productName: string;
    beneficiaries: NonNullable<ParsedPolicy["beneficiaries"]>;
  }> = [];
  const compact = block.replace(/\s+/g, " ");
  const pattern =
    /(友邦(?:(?!\s+(?:法定|指定)\s+)[\s\S]){2,120}?)\s+(法定|指定)\s+(?:(--)\s+--\s+--\s+--\s+--|([^\s]+)\s+第一顺序\s+([^\s]+)\s+([0-9.]+)%)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(compact)) !== null) {
    const productName = normalizeProductName(match[1]);
    if (match[2] === "法定") {
      entries.push({
        productName,
        beneficiaries: [{ name: "法定", relationship: null, ratio: null, type: "法定" }]
      });
      continue;
    }

    entries.push({
      productName,
      beneficiaries: [
        {
          name: match[4],
          relationship: match[5],
          ratio: Number(match[6]),
          type: "指定"
        }
      ]
    });
  }

  return entries;
}

function extractAiaBeneficiarySection(text: string, insured?: string | null) {
  const beneficiaryStart = findAiaBeneficiaryDetailsStart(text);
  const beneficiaryText = beneficiaryStart >= 0 ? text.slice(beneficiaryStart) : text;
  if (!insured) return beneficiaryText;

  const escapedInsured = escapeRegExp(insured);
  const sectionPattern = new RegExp(`(?:本人|配偶|儿子|女儿|父亲|母亲|父母|子女)\\s*-\\s*${escapedInsured}\\s*（被保险人）`);
  const match = beneficiaryText.match(sectionPattern);
  if (!match || match.index === undefined) return beneficiaryText;

  const start = match.index;
  const rest = beneficiaryText.slice(start + match[0].length);
  const nextMatch = rest.match(/(?:本人|配偶|儿子|女儿|父亲|母亲|父母|子女)\s*-\s*[^（\s]{1,16}\s*（被保险人）/);
  return nextMatch?.index === undefined ? beneficiaryText.slice(start) : beneficiaryText.slice(start, start + match[0].length + nextMatch.index);
}

function findAiaBeneficiaryDetailsStart(text: string) {
  const marker = "受益人明细";
  let index = text.indexOf(marker);
  while (index !== -1) {
    const nearby = text.slice(index, index + 900);
    if (/主险名称\s+类型\s+姓名\s+顺序\s+关系\s+份额/.test(nearby)) return index;
    index = text.indexOf(marker, index + marker.length);
  }
  return text.indexOf(marker);
}

function parseAiaBeneficiaryEntries(section: string) {
  const entries: Array<{
    productName: string;
    beneficiaries: NonNullable<ParsedPolicy["beneficiaries"]>;
  }> = [];
  let currentProduct = "";

  const lines = section
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(保单管家|受益人明细|主险名称\s+类型\s+姓名|===== PAGE)/.test(line));

  for (const line of lines) {
    if (/(?:本人|配偶|儿子|女儿|父亲|母亲|父母|子女)\s*-/.test(line)) {
      currentProduct = "";
      continue;
    }

    const specifiedMatch = line.match(/^(?:(.*?)\s+)?指定\s+(\S+)\s+第一顺序\s+(\S+)\s+([0-9.]+)%/);
    if (specifiedMatch) {
      const productPart = specifiedMatch[1]?.trim();
      const productName = normalizeProductName(`${currentProduct}${productPart ?? ""}`);
      if (productName) {
        entries.push({
          productName,
          beneficiaries: [
            {
              name: specifiedMatch[2],
              relationship: specifiedMatch[3],
              ratio: Number(specifiedMatch[4]),
              type: "指定"
            }
          ]
        });
      }
      currentProduct = "";
      continue;
    }

    const legalMatch = line.match(/^(?:(.*?)\s+)?法定(?:\s+--){1,5}/);
    if (legalMatch) {
      const productPart = legalMatch[1]?.trim();
      const productName = normalizeProductName(`${currentProduct}${productPart ?? ""}`);
      if (productName) {
        entries.push({
          productName,
          beneficiaries: [{ name: "法定", relationship: null, ratio: null, type: "法定" }]
        });
      }
      currentProduct = "";
      continue;
    }

    if (/^保险$|^\(.+\)$/.test(line) && entries.length > 0) {
      entries[entries.length - 1].productName = normalizeProductName(`${entries[entries.length - 1].productName}${line}`);
      continue;
    }

    currentProduct = normalizeProductName(`${currentProduct}${line}`);
  }

  return entries;
}

function isSameAiaProduct(left: string, right: string) {
  const normalizedLeft = normalizeProductForMatch(left);
  const normalizedRight = normalizeProductForMatch(right);
  return normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function normalizeProductForMatch(value: string) {
  return normalizeProductName(value)
    .replace(/[（）()]/g, "")
    .replace(/费率可调/g, "")
    .replace(/保险$/g, "")
    .trim();
}

function getAiaProductMatchVariants(productName: string) {
  const normalized = normalizeProductName(productName);
  return Array.from(
    new Set([
      normalized,
      normalized.replace(/[（）()]/g, ""),
      normalized.replace(/保险\(费率可调\)$/, "保险"),
      normalized.replace(/保险$/, ""),
      normalized.replace(/重大疾病保险$/, "重大疾病"),
      normalized.replace(/疾病保险$/, "疾病"),
      normalized.replace(/两全保险$/, "两全保")
    ].filter(Boolean))
  );
}

function buildLooseTextPattern(value: string) {
  return value.split("").map(escapeRegExp).join("\\s*");
}

function findBenefitSection(pages: string[], productName: string) {
  if (!productName) return "";
  const compactProduct = normalizeProductName(productName);
  return pages.find((page) => normalizeProductName(page).includes(compactProduct)) ?? "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractAiaBenefitDetails(pageText: string): NonNullable<ParsedPolicy["benefit_details"]> {
  const lines = pageText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const benefits: NonNullable<ParsedPolicy["benefit_details"]> = [];

  for (const line of lines) {
    const match = line.match(/^(.+?)\s+保额[:：]\s*([0-9,.]+)\s*元；?(.*)$/);
    if (!match) continue;
    const benefitName = match[1].trim();
    if (benefitName.length > 40 || /保单管家|保单详细利益|主险名称|保险公司/.test(benefitName)) continue;
    benefits.push({
      name: benefitName,
      type: inferBenefitType(benefitName),
      amount: toNumber(match[2]),
      description: line.replace(/\s+/g, " "),
      waiting_period: null
    });
  }

  return benefits;
}

function inferBenefitType(name: string) {
  if (/重疾|重大疾病/.test(name)) return "重大疾病责任";
  if (/轻症/.test(name)) return "轻症疾病责任";
  if (/中症/.test(name)) return "中症疾病责任";
  if (/特定疾病/.test(name)) return "特定疾病责任";
  if (/终末期/.test(name)) return "疾病终末期";
  if (/身故/.test(name)) return "身故责任";
  if (/全残/.test(name)) return "全残责任";
  return "保障责任";
}

function extractReportDate(text: string) {
  const match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:提供|生成|亲启|$)/);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function extractYears(value?: string | null) {
  if (!value) return null;
  const match = String(value).match(/\d+/);
  return match?.[0] ? Number(match[0]) : null;
}

function calculatePaidYears(effectiveDate: string | null | undefined, paymentPeriodYears: number | null, reportDate: Date) {
  const normalizedDate = normalizeDate(effectiveDate);
  if (!normalizedDate || paymentPeriodYears === null) return null;
  const [year, month, day] = normalizedDate.split("-").map(Number);
  let paidYears = 0;
  for (let offset = 0; offset < paymentPeriodYears; offset += 1) {
    const dueDate = new Date(year + offset, month - 1, day);
    if (dueDate.getTime() <= reportDate.getTime()) paidYears += 1;
  }
  return paidYears;
}

function enrichPoliciesWithComputedFields(policies: ParsedPolicy[], pdfText: string) {
  const reportDate = extractReportDate(pdfText);
  return policies.map((policy) => {
    const paymentPeriodYears = extractYears(policy.payment_period);
    const annualPremium = toNumber(policy.annual_premium);
    const paidYears = toInteger(policy.paid_years) ?? calculatePaidYears(policy.effective_date, paymentPeriodYears, reportDate);
    const remainingYears =
      toInteger(policy.remaining_years) ??
      (paymentPeriodYears === null || paidYears === null ? null : Math.max(paymentPeriodYears - paidYears, 0));
    const remainingPremium =
      toNumber(policy.remaining_premium) ?? (annualPremium === null || remainingYears === null ? null : roundMoney(annualPremium * remainingYears));

    return {
      ...policy,
      paid_years: paidYears,
      remaining_years: remainingYears,
      remaining_premium: remainingPremium,
      insurance_type: resolveInsuranceType(policy)
    };
  });
}

function resolveInsuranceType(policy: ParsedPolicy): ParsedPolicy["insurance_type"] {
  return (
    inferInsuranceTypeFromMainPolicyName(policy.main_policy_name) ??
    normalizeInsuranceType(policy.insurance_type) ??
    inferInsuranceType(`${policy.main_policy_name ?? ""} ${policy.product_info ?? ""}`)
  );
}

function inferInsuranceTypeFromMainPolicyName(value: unknown): ParsedPolicy["insurance_type"] | null {
  const name = emptyToNull(value);
  if (!name) return null;

  if (/重大疾病(?:保险|险)?|重疾/.test(name)) return "重疾险";
  if (/医疗保险|医疗险/.test(name)) return "医疗险";
  if (/意外伤害保险|意外险|意外/.test(name)) return "意外险";
  if (/寿险[（(]\s*分红险\s*[）)]|分红险|年金/.test(name)) return "年金险";
  if (/寿险|终身寿|身故/.test(name)) return "寿险";
  return null;
}

function buildVerificationRounds(
  pdfText: string,
  policies: ParsedPolicy[],
  result: {
    insertedCount: number;
    duplicateCount: number;
    missingFields: Array<{ policy: string; fields: string[] }>;
    annualPremiumTotal: number;
    remainingPremiumTotal: number;
  }
) {
  const expectedCount = extractExpectedPolicyCount(pdfText);
  const reportedAnnualPremium = pickAmount(pdfText, [/家庭年缴总保费[:： ]{0,3}([0-9,.]+)\s*元/, /保费合计[:： ]{0,3}([0-9,.]+)/]);
  const annualPremiumDifference = reportedAnnualPremium === null ? null : roundMoney(result.annualPremiumTotal - reportedAnnualPremium);
  const remainingChecks = buildRemainingPremiumChecks(policies);
  const remainingFailed = remainingChecks.filter((item) => !item.passed);
  const beneficiaryChecks = buildBeneficiaryChecks(policies);
  const beneficiaryFailed = beneficiaryChecks.filter((item) => !item.passed);
  const duplicateCountByPolicyKey = countDuplicatePoliciesByPolicyKey(policies);
  const annualPremiumTerms = policies
    .map((policy) => toNumber(policy.annual_premium))
    .filter((value): value is number => value !== null)
    .map(formatPlainMoney)
    .join(" + ");

  return [
    {
      name: "核验1：保单数量核验",
      passed: (!expectedCount || expectedCount === policies.length) && result.missingFields.length === 0,
      detail: `应提取保单数${expectedCount ? ` ${expectedCount} 份` : "未在原文明确标注"}；实际提取保单数 ${policies.length} 份；缺失核心字段 ${result.missingFields.length} 份。`
    },
    {
      name: "核验2：年缴保费合计核验",
      passed: reportedAnnualPremium === null || Math.abs(annualPremiumDifference ?? 0) < 1,
      detail: `Excel式合计 ${formatPlainMoney(result.annualPremiumTotal)} 元${
        reportedAnnualPremium ? `；原文家庭年缴总保费 ${formatPlainMoney(reportedAnnualPremium)} 元；差额 ${formatPlainMoney(annualPremiumDifference ?? 0)} 元` : ""
      }${annualPremiumTerms ? `；计算式：${annualPremiumTerms}` : ""}。`
    },
    {
      name: "核验3：待缴保费计算核验",
      passed: remainingFailed.length === 0,
      detail:
        remainingFailed.length === 0
          ? `全部通过，待缴总保费 ${formatPlainMoney(result.remainingPremiumTotal)} 元。`
          : `需复核 ${remainingFailed.length} 份：${remainingFailed
              .slice(0, 3)
              .map((item) => `${item.policy} 应为 ${formatPlainMoney(item.expected ?? 0)} 元，当前 ${formatPlainMoney(item.actual ?? 0)} 元`)
              .join("；")}。`
    },
    {
      name: "核验4：去重核验",
      passed: duplicateCountByPolicyKey === 0,
      detail: `按“被保人 + 主险名称 + 生效日”组合去重，重复 ${duplicateCountByPolicyKey} 份，入库 ${result.insertedCount} 份。`
    },
    {
      name: "核验5：受益人信息核验",
      passed: beneficiaryFailed.length === 0,
      detail:
        beneficiaryFailed.length === 0
          ? `全部通过，已核验 ${beneficiaryChecks.length} 份保单受益人信息。`
          : `需复核 ${beneficiaryFailed.length} 份：${beneficiaryFailed
              .slice(0, 3)
              .map((item) => item.policy)
              .join("、")} 未识别到受益人或法定受益人。`
    }
  ];
}

function buildRemainingPremiumChecks(policies: ParsedPolicy[]) {
  return policies.map((policy, index) => {
    const annualPremium = toNumber(policy.annual_premium);
    const remainingYears = toNumber(policy.remaining_years);
    const actual = toNumber(policy.remaining_premium);
    const expected = annualPremium === null || remainingYears === null ? null : roundMoney(annualPremium * remainingYears);
    return {
      policy: policy.main_policy_name || `保单 ${index + 1}`,
      annual_premium: annualPremium,
      remaining_years: remainingYears,
      expected,
      actual,
      passed: expected === null || actual === null ? false : Math.abs(expected - actual) < 0.01
    };
  });
}

function buildBeneficiaryChecks(policies: ParsedPolicy[]) {
  return policies.map((policy, index) => {
    const beneficiaries = policy.beneficiaries ?? [];
    const hasBeneficiary = beneficiaries.some((beneficiary) =>
      [beneficiary.name, beneficiary.relationship, beneficiary.ratio, beneficiary.type].some((value) => !isBlank(value))
    );
    return {
      policy: policy.main_policy_name || `保单 ${index + 1}`,
      beneficiaries: beneficiaries.map(formatBeneficiaryForVerification).filter(Boolean),
      passed: hasBeneficiary
    };
  });
}

function formatBeneficiaryForVerification(beneficiary: NonNullable<ParsedPolicy["beneficiaries"]>[number]) {
  const name = emptyToNull(beneficiary.name);
  const relationship = emptyToNull(beneficiary.relationship);
  const ratio = emptyToNull(beneficiary.ratio);
  const type = emptyToNull(beneficiary.type);
  return [type, name, relationship, ratio ? `${ratio}%` : null].filter(Boolean).join(" ");
}

function countDuplicatePoliciesByPolicyKey(policies: ParsedPolicy[]) {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const policy of policies) {
    const key = `${emptyToNull(policy.insured) ?? ""}|${emptyToNull(policy.main_policy_name) ?? ""}|${normalizeDate(policy.effective_date) ?? ""}`;
    if (!key.replace(/\|/g, "")) continue;
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  return duplicates;
}

function formatPlainMoney(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2
  }).format(roundMoney(value));
}

function extractSinglePolicyWithLocalRules(text: string): ParsedPolicy | null {
  const compact = text.replace(/\s+/g, " ");
  if (compact.length < 50) return null;

  const policy: ParsedPolicy = {
    policy_holder: pickText(compact, [/投保人[:： ]{0,3}([\u4e00-\u9fa5·]{2,8})/]),
    insured: pickText(compact, [/被保险人[:： ]{0,3}([\u4e00-\u9fa5·]{2,8})/, /被保人[:： ]{0,3}([\u4e00-\u9fa5·]{2,8})/]),
    beneficiaries: [],
    insurer: pickText(compact, [/([\u4e00-\u9fa5]{2,20}(?:人寿|保险|养老|健康)[\u4e00-\u9fa5]{0,12}公司)/]),
    main_policy_name: pickText(compact, [/主险(?:名称)?[:： ]{0,3}([\u4e00-\u9fa5A-Za-z0-9（）()·-]{4,40})/, /产品(?:名称)?[:： ]{0,3}([\u4e00-\u9fa5A-Za-z0-9（）()·-]{4,40})/]),
    product_info: pickText(compact, [/产品信息[:： ]{0,3}(.{4,80})/]),
    insurance_type: inferInsuranceType(compact),
    coverage_amount: pickAmount(compact, [/基本保险金额[:： ]{0,3}([0-9,.]+)\s*元?/, /保险金额[:： ]{0,3}([0-9,.]+)\s*元?/]),
    annual_premium: pickAmount(compact, [/(?:年交|年缴|期交|期缴|保险费|保费)[:： ]{0,3}([0-9,.]+)\s*元?/]),
    payment_period: pickText(compact, [/(?:缴费期间|交费期间)[:： ]{0,3}([0-9一二三四五六七八九十百]+年|终身|趸交)/]),
    effective_date: pickDate(compact, [/(?:生效日|生效日期|合同生效日)[:： ]{0,3}(\d{4}[年/-]\d{1,2}[月/-]\d{1,2})/]),
    paid_years: null,
    remaining_years: null,
    remaining_premium: null,
    policy_service: pickText(compact, [/保单服务[:： ]{0,3}(.{4,80})/]),
    benefit_details: [
      {
        name: "保障内容",
        type: inferInsuranceType(compact),
        amount: pickAmount(compact, [/基本保险金额[:： ]{0,3}([0-9,.]+)\s*元?/, /保险金额[:： ]{0,3}([0-9,.]+)\s*元?/]),
        description: compact.slice(0, 300),
        waiting_period: pickText(compact, [/等待期[:： ]{0,3}([0-9一二三四五六七八九十]+天|[0-9一二三四五六七八九十]+日)/])
      }
    ],
    payment_account: pickText(compact, [/(?:缴费账户|交费账户|扣款账户)[:： ]{0,3}([A-Za-z0-9*尾号（）() -]{4,40})/])
  };

  const beneficiary = pickText(compact, [/受益人[:： ]{0,3}([\u4e00-\u9fa5·]{2,8})/]);
  if (beneficiary) {
    policy.beneficiaries = [{ name: beneficiary, relationship: null, ratio: null, type: null }];
  }

  if (!policy.main_policy_name && !policy.insured && !policy.policy_holder) return null;
  return policy;
}

function pickText(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/[，。；;].*$/, "");
  }
  return null;
}

function pickAmount(text: string, patterns: RegExp[]) {
  const raw = pickText(text, patterns);
  if (!raw) return null;
  const number = Number(raw.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function pickDate(text: string, patterns: RegExp[]) {
  const raw = pickText(text, patterns);
  return normalizeDate(raw);
}

function pickTextFromValue(value: unknown, patterns: RegExp[]) {
  const textValue = emptyToNull(value);
  if (!textValue) return null;
  return pickText(textValue, patterns);
}

function inferInsuranceType(text: string): ParsedPolicy["insurance_type"] {
  if (/重疾|重大疾病/.test(text)) return "重疾险";
  if (/医疗|住院|门诊/.test(text)) return "医疗险";
  if (/意外/.test(text)) return "意外险";
  if (/年金|养老金|教育金/.test(text)) return "年金险";
  if (/寿险|身故|终身寿/.test(text)) return "寿险";
  return "其他";
}

async function createChatCompletionWithRetry(
  openai: OpenAI,
  payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  retries: number
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await openai.chat.completions.create(payload);
    } catch (error) {
      lastError = error;
      if (attempt < retries && isRetryableModelError(error)) {
        await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isRetryableModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /premature close|connection error|fetch failed|timeout|socket|ECONNRESET|上游模型连接中断/i.test(message);
}

function normalizeModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/premature close/i.test(message)) {
    return new Error("OpenRouter 上游模型连接中断。已自动重试仍失败，请稍后再试，或更换 OPENROUTER_MODEL。");
  }
  if (/not available in your region/i.test(message)) {
    return new Error("当前 OpenRouter 模型在你的地区不可用，请更换 OPENROUTER_MODEL。");
  }
  return error instanceof Error ? error : new Error(message);
}

async function loadExistingPolicyKeys(
  supabase: ReturnType<typeof createClient<Database>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("policies")
    .select("insured_name,product_name,effective_date")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((policy) => policyKey(policy.insured_name, policy.product_name, policy.effective_date)).filter(Boolean));
}

function getReportFileId(summary: Json) {
  if (!isPlainObject(summary)) return null;
  const value = summary.report_file_id;
  return typeof value === "string" ? value : null;
}

function policyKey(insured?: string | null, product?: string | null, effectiveDate?: string | null) {
  const date = normalizeDate(effectiveDate);
  if (!insured || !product || !date) return "";
  return `${insured.trim()}|${product.trim()}|${date}`;
}

function normalizeDate(value?: string | null) {
  if (!value) return null;
  const match = String(value).match(/\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}/);
  const source = match?.[0] ?? value;
  const normalized = source.replace(/[年月/.]/g, "-").replace(/日/g, "");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const textValue = String(value).trim();
  const multiplier = /万/.test(textValue) ? 10000 : 1;
  const cleaned = textValue.replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed * multiplier : null;
}

function toInteger(value: unknown) {
  const number = toNumber(value);
  return number === null ? null : Math.round(number);
}

function sum(values: Array<number | null>): number {
  let total = 0;
  for (const value of values) {
    total += value ?? 0;
  }
  return total;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function isPdfFile(filename: string, mimeType: string | null) {
  return mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
}

function isExcelFile(filename: string, mimeType: string | null) {
  const lowerFilename = filename.toLowerCase();
  return (
    lowerFilename.endsWith(".xlsx") ||
    lowerFilename.endsWith(".xls") ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  );
}

function parseMoney(value: unknown) {
  const textValue = emptyToNull(value);
  if (!textValue) return null;
  const firstPart = textValue.split(/[×x*]/i)[0]?.trim();
  return toNumber(firstPart || textValue);
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[：:]/g, "")
    .trim();
}

function emptyToNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function isBlank(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "";
}

function isPlainObject(value: unknown): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function fieldLabel(field: keyof ParsedPolicy) {
  const labels: Record<string, string> = {
    policy_holder: "投保人",
    insured: "被保人",
    insurer: "保险公司",
    main_policy_name: "主险名称",
    insurance_type: "保障类型",
    coverage_amount: "保险金额",
    annual_premium: "期缴保费",
    payment_period: "缴费期间",
    effective_date: "生效日"
  };
  return labels[field] ?? String(field);
}
