import { AppShell } from "@/components/app-shell";
import { UploadClient } from "./upload-client";

export default function UploadPage() {
  return (
    <AppShell title="保单管理" description="选择客户并上传 PDF、Excel 或 Word，系统会自动生成一条 H5 报告草稿。">
      <UploadClient />
    </AppShell>
  );
}
