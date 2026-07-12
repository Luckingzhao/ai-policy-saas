import { AppShell } from "@/components/app-shell";
import { UploadClient } from "./upload-client";

export default function UploadPage() {
  return (
    <AppShell title="保单智检" description="导入客户既有保单资料，自动解析、核验并生成家庭保障报告草稿。">
      <UploadClient />
    </AppShell>
  );
}
