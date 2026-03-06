// src/pages/About.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Github, Linkedin, ExternalLink, Mail } from "lucide-react";
import { Navbar } from "@/components/Navbar";

// ── Data ─────────────────────────────────────────────────────────────────────

const ENGINE_STEPS = [
  {
    step: "01",
    icon: "📐",
    title: "Spatial PDF Extraction",
    body: "We bypass error-prone AI text reading. Our custom-built parser maps the exact X/Y physical coordinates of your bank statements to extract dates, descriptions, and amounts with 100% deterministic accuracy.",
    accent: "text-amber-600",
    border: "border-amber-200/70",
    glow: "hover:border-amber-300/80 hover:shadow-amber-100",
  },
  {
    step: "02",
    icon: "🤖",
    title: "AI Categorization",
    body: "Once the numbers are mathematically secured, we pass the raw transaction names to our integrated AI. It instantly assigns smart categories without ever altering your balances.",
    accent: "text-violet-600",
    border: "border-violet-200/70",
    glow: "hover:border-violet-300/80 hover:shadow-violet-100",
  },
  {
    step: "03",
    icon: "🔀",
    title: "Hybrid Deduplication",
    body: "Seamlessly blend automation with manual control. Add cash expenses alongside your uploaded PDFs. Our strict state-management engine uses unique fingerprinting to ensure zero double-counting.",
    accent: "text-violet-700",
    border: "border-violet-300/70",
    glow: "hover:border-violet-400/90 hover:shadow-violet-100",
  },
  {
    step: "04",
    icon: "📊",
    title: "The Flawless Ledger",
    body: "All data flows into a professional-grade dashboard. It dynamically strips formatting, checks for strict Income/Expense markers, and calculates your absolute Net Cash Flow.",
    accent: "text-emerald-700",
    border: "border-emerald-300/70",
    glow: "hover:border-emerald-400/90 hover:shadow-emerald-100",
  },
];

const TECH_STACKS = [
  {
    icon: "🎨",
    title: "Frontend",
    items: ["React 18", "Vite", "TypeScript", "Tailwind CSS", "shadcn/ui", "Recharts"],
  },
  {
    icon: "⚙️",
    title: "Backend & Database",
    items: ["Node.js", "Express", "MongoDB Atlas", "Mongoose ODM", "RESTful APIs"],
  },
  {
    icon: "🔐",
    title: "Authentication",
    items: ["Firebase Auth", "JWT Tokens", "Protected Routes", "Firebase Admin SDK"],
  },
  {
    icon: "✨",
    title: "AI & Serverless",
    items: ["Supabase Edge Functions", "GitHub Models", "OpenAI API", "AI Categorization"],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function About() {
  return (
    <div className="min-h-screen bg-fixed" style={{ background: "radial-gradient(ellipse 80% 60% at 0% 0%, rgba(255,154,139,0.28) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 100% 0%, rgba(167,139,250,0.28) 0%, transparent 55%), radial-gradient(ellipse 60% 55% at 0% 100%, rgba(52,211,153,0.22) 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 100%, rgba(56,189,248,0.22) 0%, transparent 55%), linear-gradient(160deg, #fff1f2 0%, #fdf4ff 25%, #fffbeb 50%, #f0fdf4 75%, #ecfeff 100%)", backgroundAttachment: "fixed" }}>
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-24">

        {/* ================================================================ */}
        {/* 1. Hero                                                          */}
        {/* ================================================================ */}
        <header className="text-center space-y-5">
          {/* Decorative badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-300/50 bg-violet-100/80 text-violet-600 text-sm font-semibold tracking-wide">
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
            AI-Powered Personal Finance
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900">
            About{" "}
            <span className="text-violet-600">Budget Buddy</span>
          </h1>

            <p className="text-lg sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            A modern approach to personal finance, engineered for{" "}
            <span className="text-slate-900 font-semibold">absolute mathematical clarity</span>{" "}
            and{" "}
            <span className="text-slate-900 font-semibold">AI-driven control</span>.
          </p>

          {/* Decorative divider */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-violet-400/60" />
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-violet-400/60" />
          </div>
        </header>

        {/* ================================================================ */}
        {/* 2. The Intelligent Engine                                        */}
        {/* ================================================================ */}
        <section className="space-y-10">
          <div className="text-center space-y-3">
            <p className="text-amber-600 text-sm font-semibold uppercase tracking-widest">
              Under the Hood
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
              The Intelligent Engine
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Four precision-engineered stages that turn raw bank data into an
              unimpeachable financial ledger.
            </p>
          </div>

          {/* 2×2 step grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ENGINE_STEPS.map((s) => (
              <Card
                key={s.step}
                className={`
                  relative overflow-hidden
                  bg-white/70 backdrop-blur-xl
                  border ${s.border} ${s.glow}
                  hover:shadow-xl hover:bg-white/90
                  transition-all duration-300
                `}
              >
                {/* Large faded step number */}
                <span
                  className="absolute top-3 right-5 text-7xl font-black text-slate-100 select-none leading-none"
                  aria-hidden="true"
                >
                  {s.step}
                </span>

                <CardHeader className="pb-2 relative z-10">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{s.icon}</span>
                    <CardTitle className={`text-xl font-bold ${s.accent}`}>
                      {s.title}
                    </CardTitle>
                  </div>
                </CardHeader>

                <CardContent className="relative z-10">
                  <p className="text-slate-600 leading-relaxed text-sm sm:text-base">
                    {s.body}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ================================================================ */}
        {/* 3. Technical Architecture                                        */}
        {/* ================================================================ */}
        <section className="space-y-10">
          <div className="text-center space-y-3">
            <p className="text-violet-600 text-sm font-semibold uppercase tracking-widest">
              Stack
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
              Technical Architecture
            </h2>
            <p className="text-slate-600">
              Built with modern, production-grade technologies
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TECH_STACKS.map((stack) => (
              <Card
                key={stack.title}
                className="bg-white/70 backdrop-blur-xl border border-white/90 hover:border-violet-200 hover:shadow-violet-100 hover:shadow-xl hover:bg-white/90 transition-all duration-300"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-violet-700 text-xl flex items-center gap-3">
                    <span className="text-2xl">{stack.icon}</span>
                    {stack.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {stack.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-2.5 text-slate-600 text-sm"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ================================================================ */}
        {/* 4. Meet the Developer                                            */}
        {/* ================================================================ */}
        <section className="space-y-10">
          <div className="text-center space-y-3">
            <p className="text-violet-600 text-sm font-semibold uppercase tracking-widest">
              Creator
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
              Meet the Developer
            </h2>
          </div>

          <Card className="bg-white/70 backdrop-blur-xl border border-white/90 hover:border-violet-200 hover:bg-white/90 transition-all duration-300 shadow-lg shadow-violet-100/50">
            <CardContent className="pt-8">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
                {/* Avatar */}
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex-shrink-0 flex items-center justify-center shadow-lg shadow-violet-300/50 ring-4 ring-violet-200/60">
                  <span className="text-3xl font-extrabold text-white">SR</span>
                </div>

                {/* Content */}
                <div className="flex-1 space-y-4 text-center md:text-left">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">
                      Sai Rohith Dachepalli
                    </h3>
                    <p className="text-violet-600 font-semibold text-lg">
                      Full Stack &amp; AI Engineer
                    </p>
                  </div>

                  <p className="text-slate-600 leading-relaxed max-w-3xl">
                    Computer Science &amp; Engineering (AI&amp;ML) student at Vardhaman College
                    of Engineering. Budget Buddy was architected and developed from the ground up
                    to explore the intersection of full-stack web development and applied
                    artificial intelligence. This project demonstrates end-to-end system design,
                    from responsive UI/UX to scalable backend architecture and intelligent
                    automation.
                  </p>

                  {/* Social buttons */}
                  <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                    {[
                      {
                        href: "https://github.com/SAIROHITH-16",
                        icon: <Github className="h-4 w-4" />,
                        label: "GitHub",
                      },
                      {
                        href: "https://www.linkedin.com/in/dachepalli-sairohith-44968a2a5/",
                        icon: <Linkedin className="h-4 w-4" />,
                        label: "LinkedIn",
                      },
                      {
                        href: "mailto:dachepallysairohith@gmail.com",
                        icon: <Mail className="h-4 w-4" />,
                        label: "Email",
                      },
                    ].map(({ href, icon, label }) => (
                      <Button
                        key={label}
                        variant="ghost"
                        size="sm"
                        className="border border-violet-200 bg-violet-50/50 text-slate-700 hover:text-violet-600 hover:border-violet-400 hover:bg-violet-50 transition-all duration-200"
                        asChild
                      >
                        <a
                          href={href}
                          target={href.startsWith("mailto") ? undefined : "_blank"}
                          rel="noopener noreferrer"
                          className="flex items-center gap-2"
                        >
                          {icon}
                          {label}
                        </a>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ================================================================ */}
        {/* 5. Footer CTA                                                    */}
        {/* ================================================================ */}
        <section className="text-center space-y-6 py-8 border-t border-violet-100">
          <div className="space-y-3">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Want to see how it works under the hood?
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Budget Buddy is open source. Explore the codebase, review the architecture,
              and see how modern web technologies come together.
            </p>
          </div>

          <Button
            size="lg"
            className="bg-violet-600 hover:bg-violet-700 text-white font-bold px-8 py-6 text-base shadow-lg shadow-violet-600/30 hover:shadow-violet-700/40 transition-all duration-300"
            asChild
          >
            <a
              href="https://github.com/SAIROHITH-16/Budget-Buddy"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <ExternalLink className="h-5 w-5" />
              View Source Code
            </a>
          </Button>

            <p className="text-xs text-slate-400 pt-4">
            Built with passion for modern web development and intelligent automation.
          </p>
        </section>

      </div>
    </div>
  );
}
