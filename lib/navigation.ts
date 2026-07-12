import { BarChart3, FileSearch, LayoutDashboard, ScrollText, Settings, Sparkles, Users } from "lucide-react";

export const appNavItems = [
  { href: "/dashboard", label: "工作台", icon: LayoutDashboard },
  { href: "/customers", label: "客户管理", icon: Users },
  { href: "/upload", label: "保单智检", icon: FileSearch },
  { href: "/policy-builder", label: "保单智成", icon: Sparkles },
  { href: "/reports", label: "报告管理", icon: ScrollText },
  { href: "/brand", label: "我的品牌设置", icon: Settings },
  { href: "/usage", label: "用量统计", icon: BarChart3 }
];
