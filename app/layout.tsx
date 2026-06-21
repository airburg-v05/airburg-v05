import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Airburg Data · 电商数据分析平台",
    template: "%s · Airburg Data",
  },
  description: "面向天猫店铺运营的本地电商数据分析平台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
