import type React from "react";
import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useInView, useMotionValue, useSpring } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  FileText,
  Gauge,
  GraduationCap,
  Layers3,
  Lock,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const fadeInSection = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.28 },
};

export default function Home() {
  const navigate = useNavigate();
  const containerClass = "mx-auto w-full px-6 sm:px-8 lg:px-14 2xl:px-20";
  const heroCapabilities = [
    {
      title: "Digital Experiment Typing",
      description: "Structured writing interface for lab-ready records.",
      icon: FileText,
    },
    {
      title: "Faculty Evaluation Workflow",
      description: "Guided validation flow for faster review cycles.",
      icon: ClipboardCheck,
    },
    {
      title: "Real-time Submission Tracking",
      description: "Live visibility into student progress and status.",
      icon: Gauge,
    },
    {
      title: "Internal Marks Management",
      description: "Consistent mark entry and performance oversight.",
      icon: BarChart3,
    },
  ];
  const heroStats = [
    { label: "Experiments Managed", value: 350, suffix: "+" },
    { label: "Students Using Platform", value: 1200, suffix: "+" },
    { label: "Faculty Evaluations", value: 900, suffix: "+" },
    { label: "Lab Records Submitted", value: 5400, suffix: "+" },
  ];
  const liveSessions = Math.round(heroStats[1].value / 10);
  const reviewsToday = Math.round(heroStats[2].value * 0.05);
  const syncStatus =
    heroStats[3].value > 5000 ? "Stable" : "Monitoring";
  const topHeroSignals = [
    {
      label: "Live Sessions",
      value: liveSessions.toString(),
      className: "border-blue-200 bg-blue-50",
    },
    {
      label: "Reviews Today",
      value: reviewsToday.toString(),
      className: "border-indigo-200 bg-indigo-50",
    },
    {
      label: "Sync Status",
      value: syncStatus,
      className: "border-emerald-200 bg-emerald-50",
    },
  ];

  const features = [
    {
      title: "Experiment Typing",
      description:
        "Students can write structured lab records with guided experiment sections.",
      icon: FileText,
    },
    {
      title: "Progress Tracking",
      description:
        "Automatic completion tracking for every experiment and subject-wise progress.",
      icon: Gauge,
    },
    {
      title: "Faculty Evaluation",
      description:
        "Faculty can review submissions and validate outcomes with faster workflows.",
      icon: ClipboardCheck,
    },
    {
      title: "AI Assistance",
      description:
        "AI scoring and validation support helps streamline internal evaluation.",
      icon: Cpu,
    },
    {
      title: "Role-Based Access",
      description:
        "Separate secure environments for students, faculty, and administrators.",
      icon: Lock,
    },
    {
      title: "Exam Mode",
      description:
        "Live exam environment with controlled access and secure submission flow.",
      icon: Layers3,
    },
  ];

  const workflowSteps = [
    "Student: Types experiment",
    "Student: Submits record",
    "Faculty: Reviews submission",
    "Faculty: Assigns marks",
    "Admin: Manages subjects",
    "Admin: Monitors completion",
  ];

  const stats = [
    { label: "Students Using System", value: 1200, suffix: "+" },
    { label: "Experiments Tracked", value: 350, suffix: "+" },
    { label: "Faculty Evaluations", value: 900, suffix: "+" },
    { label: "Departments", value: 6, suffix: "" },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* 1) HERO */}
      <section className="relative overflow-hidden pb-10 pt-8 md:pb-12 md:pt-10">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/60 to-white" />
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(30, 64, 175, 0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(30, 64, 175, 0.14) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
            maskImage:
              "radial-gradient(circle at center, black 45%, rgba(0, 0, 0, 0.25) 80%, transparent 100%)",
          }}
        />
        <div
          className={`${containerClass} relative grid gap-10 lg:min-h-[48vh] lg:grid-cols-[1.05fr_0.95fr] lg:items-start`}
        >
          <motion.div {...fadeInSection} className="relative z-20 space-y-7">
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
              {topHeroSignals.map((signal) => (
                <span
                  key={signal.label}
                  className={`rounded-full border px-3 py-1 ${signal.className}`}
                >
                  {signal.label}: {signal.value}
                </span>
              ))}
            </div>

            <div className="max-w-lg rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-sm">
              <p className="text-xs font-medium text-slate-700">
                Coordinator Update
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {heroStats[3].value.toLocaleString()} records are in the
                platform with live monitoring and streamlined faculty
                validation.
              </p>
            </div>

            <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1 text-sm font-medium text-blue-700">
              <GraduationCap className="h-4 w-4" />
              Academic Lab Management System
            </span>

            <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">
              Digital Lab Record &
              <span className="block text-blue-600">
                Internal Evaluation System
              </span>
            </h1>

            <p className="max-w-xl text-slate-600">
              A secure academic platform for managing laboratory experiments,
              submissions, faculty evaluations, and internal marks - all in one
              unified system.
            </p>

            <div className="flex flex-wrap gap-4">
              <Button
                asChild
                size="lg"
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                <Link to="/login">
                  Get Started <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
              >
                <Link to="/login">Login</Link>
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="relative z-20 mx-auto w-full max-w-xl"
          >
            <div className="absolute -inset-6 rounded-full bg-blue-500/20 blur-3xl" />
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              className="relative rounded-xl border border-blue-100 bg-white p-5 shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">
                  Student Experiment Editor
                </p>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                  Draft Saved
                </span>
              </div>
              <div className="space-y-2">
                <div className="h-2.5 rounded bg-slate-100" />
                <div className="h-2.5 w-11/12 rounded bg-slate-100" />
                <div className="h-2.5 w-10/12 rounded bg-slate-100" />
              </div>
            </motion.div>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -left-4 top-28 w-60 rounded-xl border border-indigo-100 bg-white p-4 shadow-md"
            >
              <p className="mb-1 text-sm font-semibold text-slate-700">
                Faculty Evaluation Panel
              </p>
              <div className="h-2.5 w-4/5 rounded bg-indigo-100" />
              <p className="mt-2 text-xs text-slate-500">Pending: 12 records</p>
            </motion.div>
            <motion.div
              animate={{ y: [0, -7, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-3 bottom-8 w-56 rounded-xl border border-emerald-100 bg-white p-4 shadow-md"
            >
              <p className="mb-2 text-sm font-semibold text-slate-700">
                Admin Analytics
              </p>
              <div className="h-2.5 w-5/6 rounded bg-emerald-100" />
              <div className="mt-2 h-2.5 w-3/5 rounded bg-emerald-100" />
            </motion.div>
          </motion.div>
        </div>

        <div className={`${containerClass} relative mt-6 md:mt-7`}>
          <motion.div {...fadeInSection} className="space-y-5">
            <div className="rounded-2xl border border-blue-200/70 bg-gradient-to-r from-blue-100/60 via-white to-indigo-100/60 px-5 py-4 shadow-[0_0_0_1px_rgba(59,130,246,0.08),0_8px_26px_rgba(59,130,246,0.12)] md:px-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/85 text-blue-700 shadow-sm">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 md:text-base">
                    Welcome to the Digital Lab Workspace
                  </p>
                  <p className="mt-1 text-xs text-slate-600 md:text-sm">
                    Designed for structured experiment writing, seamless faculty
                    validation, and real-time academic tracking.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {heroCapabilities.map((capability) => (
                <motion.div
                  key={capability.title}
                  whileHover={{ y: -5 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-xl border border-white/50 bg-white/70 p-4 shadow-md backdrop-blur-sm hover:shadow-lg"
                >
                  <div className="mb-3 inline-flex rounded-lg bg-blue-100/85 p-2.5 text-blue-700">
                    <capability.icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">
                    {capability.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {capability.description}
                  </p>
                </motion.div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {heroStats.map((stat, index) => (
                  <div
                    key={stat.label}
                    className={`rounded-lg bg-white/85 px-4 py-3 ${
                      index < heroStats.length - 1
                        ? "xl:border-r xl:border-slate-200/80"
                        : ""
                    }`}
                  >
                    <p className="text-xs text-slate-500">{stat.label}</p>
                    <p className="mt-1 text-2xl font-bold text-blue-700">
                      <Counter value={stat.value} suffix={stat.suffix} />
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute right-14 top-6 z-10 hidden rounded-xl border border-blue-100/80 bg-white/90 p-2.5 shadow-sm xl:block"
        >
          <p className="text-[11px] font-semibold text-slate-700">Experiment Draft Saved</p>
          <p className="text-[10px] text-slate-500">Auto-sync completed just now</p>
        </motion.div>
        <motion.div
          animate={{ y: [0, 4, 0] }}
          transition={{ duration: 5.1, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute right-8 top-[33%] z-10 hidden rounded-xl border border-indigo-100/80 bg-white/90 p-2.5 shadow-sm xl:block"
        >
          <p className="text-[11px] font-semibold text-slate-700">Faculty Review Pending</p>
          <p className="text-[10px] text-slate-500">12 submissions queued</p>
        </motion.div>
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none absolute bottom-14 right-[18%] z-10 hidden rounded-xl border border-emerald-100/80 bg-white/90 p-2.5 shadow-sm xl:block"
        >
          <p className="text-[11px] font-semibold text-slate-700">Marks Published</p>
          <p className="text-[10px] text-slate-500">Latest cycle successfully released</p>
        </motion.div>
      </section>

      {/* 2) PRODUCT PREVIEW */}
      <section className="pb-8 pt-3 md:pb-10 md:pt-5">
        <motion.div {...fadeInSection} className={containerClass}>
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <PreviewMockup title="Digital Lab Experiment Workspace" />
            <div>
              <h2 className="mb-4 text-3xl font-bold">
                Digital Lab Experiment Workspace
              </h2>
              <ul className="space-y-3 text-slate-600">
                <li>Structured experiment typing interface</li>
                <li>Auto progress tracking</li>
                <li>Code editor support</li>
                <li>AI-assisted evaluation pipeline</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 grid items-center gap-10 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <h3 className="mb-4 text-3xl font-bold">
                Faculty Evaluation Dashboard
              </h3>
              <ul className="space-y-3 text-slate-600">
                <li>Review student submissions</li>
                <li>Assign internal marks</li>
                <li>Track completion progress</li>
                <li>Identify defaulters quickly</li>
              </ul>
            </div>
            <div className="order-1 lg:order-2">
              <PreviewMockup title="Faculty Evaluation Dashboard" />
            </div>
          </div>
        </motion.div>
      </section>

      {/* 3) KEY FEATURES */}
      <section className="bg-slate-50 py-8 md:py-10">
        <motion.div {...fadeInSection} className={containerClass}>
          <h2 className="text-center text-3xl font-bold">Key Features</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            Every part of the workflow is designed for academic scale,
            evaluation accuracy, and faster record handling.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </motion.div>
      </section>

      {/* 4) WORKFLOW */}
      <section className="py-8 md:py-10">
        <motion.div {...fadeInSection} className={containerClass}>
          <h2 className="text-center text-3xl font-bold">Workflow</h2>
          <p className="mt-3 text-center text-slate-600">
            Connected process from student submission to faculty validation and
            admin oversight.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workflowSteps.map((step, index) => (
              <motion.div
                key={step}
                whileHover={{ y: -6 }}
                transition={{ duration: 0.22 }}
                className="relative rounded-xl border bg-white p-5 shadow-md hover:shadow-xl"
              >
                <span className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                  {index + 1}
                </span>
                <p className="font-medium text-slate-700">{step}</p>
                {index < workflowSteps.length - 1 && (
                  <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-300 lg:block" />
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* 5) ANALYTICS */}
      <section className="bg-slate-50 py-8 md:py-10">
        <motion.div {...fadeInSection} className={containerClass}>
          <h2 className="text-center text-3xl font-bold">System Insights</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <AnalyticsCard title="Total Experiments" value="350" progress={82} />
            <AnalyticsCard title="Submissions Today" value="94" progress={68} />
            <AnalyticsCard title="Average Marks" value="78%" progress={78} />
            <AnalyticsCard title="Completion Rate" value="91%" progress={91} />
          </div>
        </motion.div>
      </section>

      {/* 6) FOUR PORTALS */}
      <section className="py-8 md:py-10">
        <motion.div {...fadeInSection} className={containerClass}>
          <h2 className="text-center text-3xl font-bold">Four Powerful Portals</h2>
          <p className="mt-3 text-center text-slate-600">
            Tailored experiences for every role in the institution.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <PortalCard
              icon={<BookOpenCheck className="h-5 w-5" />}
              title="Student Portal"
              points={[
                "Type lab experiments digitally",
                "Submit records online",
                "View marks and validation",
                "Track experiment status",
              ]}
              iconBg="from-blue-500 to-indigo-500"
            />
            <PortalCard
              icon={<GraduationCap className="h-5 w-5" />}
              title="Faculty Portal"
              points={[
                "Create experiment templates",
                "Review submissions",
                "Validate experiments",
                "Assign internal marks",
              ]}
              iconBg="from-indigo-500 to-violet-500"
            />
            <PortalCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Admin Portal"
              points={[
                "Manage users and roles",
                "Configure subjects",
                "Monitor lab completion",
                "Control the full workflow",
              ]}
              iconBg="from-emerald-500 to-teal-500"
            />
            <motion.button
              type="button"
              whileHover={{ y: -6 }}
              transition={{ duration: 0.22 }}
              className="rounded-xl border bg-white p-6 text-left shadow-md hover:shadow-xl"
              onClick={() => navigate("/exam/login")}
            >
              <div className="mb-4 inline-flex rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 p-3 text-white">
                <Layers3 className="h-5 w-5" />
              </div>
              <h3 className="mb-3 text-xl font-semibold">Exam Mode</h3>
              <p className="text-sm text-slate-600">
                Join live exam sessions with secure room-based access and
                real-time submission handling.
              </p>
              <span className="mt-5 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">
                Enter Exam
              </span>
            </motion.button>
          </div>
        </motion.div>
      </section>

      {/* 7) SECURITY */}
      <section className="bg-slate-50 py-8 md:py-10">
        <motion.div
          {...fadeInSection}
          className={`${containerClass} grid gap-10 lg:grid-cols-2 lg:items-center`}
        >
          <div>
            <h2 className="mb-4 text-3xl font-bold">
              Secure Academic Infrastructure
            </h2>
            <ul className="space-y-3 text-slate-600">
              <li>Role-based authentication</li>
              <li>Secure submission tracking</li>
              <li>Faculty validation controls</li>
              <li>Audit logging for submissions</li>
            </ul>
          </div>
          <div className="relative mx-auto flex w-full max-w-md items-center justify-center rounded-xl border bg-white p-10 shadow-md">
            <div className="absolute -inset-5 rounded-full bg-blue-500/10 blur-2xl" />
            <div className="relative flex flex-col items-center">
              <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white">
                <ShieldCheck className="h-12 w-12" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">
                End-to-end role and data protection
              </p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* 8) STATISTICS */}
      <section className="py-8 md:py-10">
        <motion.div {...fadeInSection} className={containerClass}>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {stats.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border bg-white p-6 text-center shadow-md hover:shadow-xl"
              >
                <p className="text-sm text-slate-500">{item.label}</p>
                <p className="mt-2 text-4xl font-extrabold text-blue-600">
                  <Counter value={item.value} suffix={item.suffix} />
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* 9) CTA */}
      <section className="py-10 md:py-12">
        <div className={containerClass}>
          <motion.div
            {...fadeInSection}
            className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-14 text-center text-white shadow-md"
          >
            <h2 className="text-3xl font-bold">Ready to Go Digital?</h2>
            <p className="mx-auto mt-4 max-w-2xl text-blue-100">
              Simplify lab records, evaluations, and administration with one
              unified platform.
            </p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="mt-8 bg-white text-blue-700 hover:bg-blue-50"
            >
              <Link to="/login">Start Using System</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* 10) FOOTER */}
      <footer className="border-t py-10 md:py-12">
        <div className={`${containerClass} grid gap-8 md:grid-cols-3`}>
          <div>
            <h3 className="mb-4 font-semibold text-slate-800">System</h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>Student Portal</li>
              <li>Faculty Portal</li>
              <li>Admin Portal</li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 font-semibold text-slate-800">Resources</h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>Documentation</li>
              <li>Support</li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 font-semibold text-slate-800">Institution</h3>
            <p className="text-sm text-slate-600">
              St. Peter&apos;s College of Engineering and Technology
            </p>
            <p className="mt-4 text-sm text-slate-500">
              © 2026 Lab Record System
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ duration: 0.22 }}
      className="rounded-xl border bg-white p-6 shadow-md hover:shadow-xl"
    >
      <div className="mb-4 inline-flex rounded-xl bg-blue-100 p-3 text-blue-700">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </motion.div>
  );
}

function PortalCard({
  icon,
  title,
  points,
  iconBg,
}: {
  icon: React.ReactNode;
  title: string;
  points: string[];
  iconBg: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ duration: 0.22 }}
      className="rounded-xl border bg-white p-6 shadow-md hover:shadow-xl"
    >
      <div
        className={`mb-4 inline-flex rounded-xl bg-gradient-to-r p-3 text-white ${iconBg}`}
      >
        {icon}
      </div>
      <h3 className="mb-3 text-xl font-semibold">{title}</h3>
      <ul className="space-y-2 text-sm text-slate-600">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-blue-600" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function PreviewMockup({ title }: { title: string }) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-md">
      <div className="mb-5 flex items-center justify-between">
        <p className="font-semibold text-slate-700">{title}</p>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          Live
        </span>
      </div>
      <div className="space-y-3">
        <div className="h-2.5 rounded bg-slate-100" />
        <div className="h-2.5 w-11/12 rounded bg-slate-100" />
        <div className="h-2.5 w-10/12 rounded bg-slate-100" />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-blue-50 p-3">
          <BarChart3 className="h-4 w-4 text-blue-600" />
        </div>
        <div className="rounded-lg bg-indigo-50 p-3">
          <Users className="h-4 w-4 text-indigo-600" />
        </div>
        <div className="rounded-lg bg-emerald-50 p-3">
          <BookOpenCheck className="h-4 w-4 text-emerald-600" />
        </div>
      </div>
    </div>
  );
}

function AnalyticsCard({
  title,
  value,
  progress,
}: {
  title: string;
  value: string;
  progress: number;
}) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-md hover:shadow-xl">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
      <div className="mt-5 h-2.5 rounded-full bg-slate-100">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${progress}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.28 }}
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
        />
      </div>
    </div>
  );
}

function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true });
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { duration: 300 });

  useEffect(() => {
    if (inView) {
      motionValue.set(value);
    }
  }, [inView, motionValue, value]);

  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = `${Math.round(latest)}${suffix}`;
      }
    });
    return () => unsubscribe();
  }, [springValue, suffix]);

  return <span ref={ref}>0{suffix}</span>;
}
