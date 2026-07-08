import { AppShell } from "@/components/app-shell";
import { CustomersClient } from "./customers-client";

export default function CustomersPage() {
  return (
    <AppShell title="客户管理" description="每位业务员只能看到自己创建的客户。">
      <CustomersClient />
    </AppShell>
  );
}
