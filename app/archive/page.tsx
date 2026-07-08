import { AppShell } from "@/components/app-shell";
import { ArchiveClient } from "./archive-client";

export default function ArchivePage() {
  return (
    <AppShell title="归档报告" description="查看已归档的历史报告，必要时可恢复到报告管理继续操作。">
      <ArchiveClient />
    </AppShell>
  );
}
