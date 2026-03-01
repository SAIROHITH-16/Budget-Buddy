import { Link } from "react-router-dom";
import { Brain, FileSpreadsheet, Bell, ArrowRight, Github, Linkedin, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";

export default function Landing() {
  return (
    <div className="min-h-screen text-foreground">
      {/* Navigation Bar */}
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        {/* Glowing Background Orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/20 rounded-full blur-3xl opacity-40 dark:opacity-30"></div>
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[#ee9b00]/20 rounded-full blur-3xl opacity-30 dark:opacity-20"></div>
        </div>

        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold text-foreground mb-6 leading-tight">
            Master your wealth with{" "}
            <span className="bg-gradient-to-r from-[#0a9396] to-[#ee9b00] bg-clip-text text-transparent">
              intelligent tracking
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed">
            Budget Buddy combines frictionless importing with AI-driven insights to give you 
            complete control over your financial future.
          </p>

          <Link to="/register">
            <Button 
              size="lg" 
              className="bg-violet-600 text-white hover:bg-violet-700 font-bold text-lg px-8 py-6 shadow-xl shadow-violet-600/30 group"
            >
              Start tracking for free
              <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Tech Stack Banner */}
      <section className="relative py-16 border-y border-border">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-muted-foreground text-sm uppercase tracking-widest mb-8">
            Built with modern web technologies
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
            {[
              "React 18",
              "TypeScript",
              "Tailwind CSS",
              "Firebase Auth",
              "SQLite",
              "GitHub Models AI"
            ].map((tech) => (
              <div 
                key={tech} 
                className="text-primary font-semibold text-lg hover:text-primary/80 transition-colors cursor-default"
              >
                {tech}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bento Box Feature Grid */}
      <section className="relative py-32">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-bold text-center text-foreground mb-4">
            Everything you need to stay in control
          </h2>
          <p className="text-center text-muted-foreground text-lg mb-16 max-w-2xl mx-auto">
            Powerful features designed to give you clarity, confidence, and complete financial visibility.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Card 1 - AI Insights */}
            <div className="group relative bg-card/50 border border-border rounded-2xl p-8 hover:bg-card transition-all duration-300 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 ring-1 ring-primary/30">
                <Brain className="w-7 h-7 text-primary" />
              </div>
              
              <h3 className="text-2xl font-bold text-foreground mb-4">
                AI-Powered Insights
              </h3>
              
              <p className="text-muted-foreground leading-relaxed">
                GPT-4o automatically categorizes transactions and provides intelligent monthly 
                spending analysis with personalized saving suggestions.
              </p>

              <div className="mt-6 inline-flex items-center text-primary font-semibold group-hover:translate-x-1 transition-transform">
                Learn more <ArrowRight className="ml-2 w-4 h-4" />
              </div>
            </div>

            {/* Card 2 - CSV Imports */}
            <div className="group relative bg-card/50 border border-border rounded-2xl p-8 hover:bg-card transition-all duration-300 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6 ring-1 ring-primary/30">
                <FileSpreadsheet className="w-7 h-7 text-primary" />
              </div>
              
              <h3 className="text-2xl font-bold text-foreground mb-4">
                Smart Review Queue
              </h3>
              
              <p className="text-muted-foreground leading-relaxed">
                Import CSV bank statements in seconds. AI pre-fills categories, and you simply 
                review and approve or reject with one click.
              </p>

              <div className="mt-6 inline-flex items-center text-primary font-semibold group-hover:translate-x-1 transition-transform">
                Learn more <ArrowRight className="ml-2 w-4 h-4" />
              </div>
            </div>

            {/* Card 3 - Budget Alerts */}
            <div className="group relative bg-card/50 border border-border rounded-2xl p-8 hover:bg-card transition-all duration-300 hover:shadow-xl hover:shadow-destructive/20 hover:-translate-y-1">
              <div className="w-14 h-14 rounded-xl bg-destructive/10 flex items-center justify-center mb-6 ring-1 ring-destructive/30">
                <Bell className="w-7 h-7 text-destructive" />
              </div>
              
              <h3 className="text-2xl font-bold text-foreground mb-4">
                Budget Limit Alerts
              </h3>
              
              <p className="text-muted-foreground leading-relaxed">
                Set monthly spending limits and get instant visual warnings when you approach 
                your threshold. Stay in control, every month.
              </p>

              <div className="mt-6 inline-flex items-center text-destructive font-semibold group-hover:translate-x-1 transition-transform">
                Learn more <ArrowRight className="ml-2 w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 border-t border-border">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Ready to take control of your finances?
          </h2>
          <p className="text-xl text-muted-foreground mb-10">
            Join thousands of users who trust Budget Buddy to manage their wealth.
          </p>
          
          <Link to="/register">
            <Button 
              size="lg" 
              className="bg-violet-600 text-white hover:bg-violet-700 font-bold text-lg px-8 py-6 shadow-xl shadow-violet-600/30"
            >
              Get started now — it's free
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 border-t border-border bg-background">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <img 
                src="/logo.png" 
                alt="Budget Buddy Logo" 
                className="w-8 h-8 rounded-lg object-contain shadow-lg shadow-[#0a9396]/20"
              />
              <div className="flex flex-col justify-center">
                <span className="text-lg font-bold text-slate-800 leading-none">Budget Buddy</span>
                <span className="text-xs font-medium text-slate-400 mt-0.5">Personal Finance</span>
              </div>
            </div>

            <p className="text-muted-foreground text-sm">
              © 2026 Budget Buddy. Built by Sai Rohith Dachepalli.
            </p>

            <div className="flex items-center gap-4">
              <a 
                href="https://github.com/SAIROHITH-16/Budget-Buddy" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <Github className="w-5 h-5" />
              </a>
              <a 
                href="https://www.linkedin.com/in/dachepalli-sairohith-44968a2a5/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <Linkedin className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
