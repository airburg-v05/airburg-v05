"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CheckIcon, DatabaseIcon, LayersIcon } from "@/components/icons";
import { saveDemoSession } from "@/lib/storage/analysis-storage";

const highlights = [
  "天猫 Excel / CSV 本地解析",
  "字段映射、数据清洗和经营指标计算",
  "商品排行与问题商品识别",
];

export default function LoginPage() {
  const router = useRouter();
  const [account, setAccount] = useState("demo@airburg.local");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!account.trim() || !password.trim()) {
      setError("请输入登录账号和密码");
      return;
    }

    saveDemoSession(account.trim());
    router.push("/home");
  };

  return (
    <main className="min-h-screen bg-slate-950 lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden px-12 py-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-24 top-20 h-80 w-80 rounded-full bg-blue-600/25 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">AD</div>
          <div>
            <p className="font-semibold text-white">Airburg Data</p>
            <p className="text-sm text-slate-400">电商数据分析平台</p>
          </div>
        </div>

        <div className="relative z-10 max-w-2xl py-16">
          <span className="inline-flex rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-200">
            多平台经营数据
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
            把分散的店铺数据，
            <br />
            变成每天可用的经营判断。
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300">
            从本地表格上传开始，逐步沉淀统一字段、指标口径、商品看板和经营目标协同。
          </p>

          <div className="mt-10 space-y-4">
            {highlights.map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-slate-200">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                  <CheckIcon className="h-4 w-4" />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <DatabaseIcon className="h-6 w-6 text-blue-300" />
            <p className="mt-3 text-sm font-semibold text-white">数据留在本地</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">当前版本不上传服务器，适合先验证真实经营场景。</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <LayersIcon className="h-6 w-6 text-cyan-300" />
            <p className="mt-3 text-sm font-semibold text-white">面向长期扩展</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">后续可继续扩展多店铺、多平台和多角色协作。</p>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">AD</div>
            <div>
              <p className="font-semibold text-slate-900">Airburg Data</p>
              <p className="text-xs text-slate-500">电商数据分析平台</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
            <div>
              <p className="text-sm font-semibold text-blue-600">欢迎回来</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">登录经营工作台</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                当前为本地演示登录，后续 SaaS 阶段再接入正式账号和权限系统。
              </p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <label className="block" htmlFor="login-account">
                <span className="text-sm font-medium text-slate-700">邮箱 / 登录名</span>
                <input
                  id="login-account"
                  name="account"
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                  className="form-input mt-2"
                  placeholder="请输入邮箱或登录名"
                  autoComplete="username"
                />
              </label>

              <label className="block" htmlFor="login-password">
                <span className="text-sm font-medium text-slate-700">密码</span>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="form-input mt-2"
                  placeholder="请输入密码"
                  autoComplete="current-password"
                />
              </label>

              {error ? (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
              ) : null}

              <button type="submit" className="primary-button w-full justify-center py-3">
                进入工作台
              </button>
            </form>

            <div className="mt-6 rounded-xl bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
              演示说明：页面已预填测试账号，直接点击“进入工作台”即可。
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">Airburg Data · 本地经营工作台</p>
        </div>
      </section>
    </main>
  );
}
